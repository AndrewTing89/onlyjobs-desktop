/**
 * Parse Queue Worker
 * 
 * This worker:
 * - Processes emails marked for parsing in classification_queue
 * - Uses batch processing when possible (extractStage2Batch from two-stage-classifier.js)
 * - Updates parse_status as items are processed
 * - Handles failures gracefully
 * - Creates job records from successfully parsed emails
 */

const { extractStage2, extractStage2Batch } = require('../llm/two-stage-classifier');
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class ParseQueueWorker {
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    this.isProcessing = false;
    this.shouldStop = false;
  }

  /**
   * Process pending parse queue items
   */
  async processParseQueue(options = {}) {
    const {
      modelId = 'llama-3-8b-instruct-q5_k_m',
      batchSize = 3,
      maxItems = 100,
      accountEmail = null
    } = options;

    if (this.isProcessing) {
      console.log('Parse queue worker is already running');
      return { message: 'Already processing' };
    }

    this.isProcessing = true;
    this.shouldStop = false;

    try {
      console.log(`Starting parse queue processing with model ${modelId}`);
      
      // Get pending items
      const pendingItems = await this.getPendingParseItems(accountEmail, maxItems);
      
      if (pendingItems.length === 0) {
        console.log('No items in parse queue');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          message: 'No items to process'
        };
      }

      console.log(`Found ${pendingItems.length} items to parse`);
      this.sendProgress(`Processing ${pendingItems.length} items from parse queue`, 0);

      // Process items in batches
      const results = await this.processItemsInBatches(pendingItems, modelId, batchSize);
      
      // Create job records from successful parses
      await this.createJobRecords(results.successful);

      console.log(`Parse queue processing complete: ${results.successful.length} successful, ${results.failed.length} failed`);
      
      return {
        processed: results.successful.length + results.failed.length,
        successful: results.successful.length,
        failed: results.failed.length,
        items: results.successful.concat(results.failed)
      };

    } catch (error) {
      console.error('Parse queue processing error:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.shouldStop = false;
    }
  }

  /**
   * Get pending items from parse queue
   */
  async getPendingParseItems(accountEmail = null, limit = 100) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      let query = `
        SELECT 
          id,
          gmail_message_id,
          thread_id,
          account_email,
          subject,
          from_address,
          body,
          is_job_related,
          confidence,
          created_at
        FROM classification_queue 
        WHERE parse_status = 'pending' AND is_job_related = 1
      `;
      
      const params = [];
      if (accountEmail) {
        query += ' AND account_email = ?';
        params.push(accountEmail);
      }
      
      query += ' ORDER BY created_at ASC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      return stmt.all(...params);

    } catch (error) {
      console.error('Error getting pending parse items:', error);
      return [];
    } finally {
      db.close();
    }
  }

  /**
   * Process items in batches using LLM
   */
  async processItemsInBatches(items, modelId, batchSize) {
    const successful = [];
    const failed = [];
    const modelPath = `/Users/ndting/Library/Application Support/models/${modelId}.gguf`;

    // First check if model file exists
    const fs = require('fs');
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model file not found: ${modelPath}`);
    }

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      if (this.shouldStop) {
        console.log('Parse queue processing stopped by user');
        break;
      }

      const batch = items.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(items.length / batchSize);

      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);
      this.sendProgress(
        `Processing batch ${batchNum}/${totalBatches}`, 
        Math.round((i / items.length) * 80) // 0-80% for processing
      );

      try {
        // Mark items as being parsed
        await this.updateParseStatus(batch.map(item => item.id), 'parsing');

        let batchResults;

        if (batch.length === 1) {
          // Single item processing
          const item = batch[0];
          const result = await this.processSingleItem(item, modelId, modelPath);
          batchResults = [result];
        } else {
          // Batch processing when possible
          batchResults = await this.processBatch(batch, modelId, modelPath);
        }

        // Categorize results
        for (const result of batchResults) {
          if (result.success) {
            successful.push(result);
            await this.updateParseStatus([result.id], 'parsed', result.data);
          } else {
            failed.push(result);
            await this.updateParseStatus([result.id], 'failed', null, result.error);
          }
        }

      } catch (batchError) {
        console.error(`Batch ${batchNum} processing error:`, batchError);
        
        // Mark all items in batch as failed
        for (const item of batch) {
          failed.push({
            id: item.id,
            gmail_message_id: item.gmail_message_id,
            success: false,
            error: batchError.message
          });
          await this.updateParseStatus([item.id], 'failed', null, batchError.message);
        }
      }

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.sendProgress('Processing complete', 80);
    return { successful, failed };
  }

  /**
   * Process a batch of items using extractStage2Batch
   */
  async processBatch(batch, modelId, modelPath) {
    try {
      // Prepare emails for batch processing
      const emails = batch.map(item => ({
        subject: item.subject || '',
        body: item.body || ''
      }));

      console.log(`Running LLM batch extraction on ${emails.length} emails`);
      const startTime = Date.now();

      // Use batch extraction from two-stage-classifier
      const batchResults = await extractStage2Batch(modelId, modelPath, emails);

      const processingTime = Date.now() - startTime;
      console.log(`Batch LLM extraction completed in ${processingTime}ms`);

      // Map results back to items
      return batch.map((item, index) => {
        const llmResult = batchResults[index];
        
        if (llmResult && llmResult.company && llmResult.position) {
          return {
            id: item.id,
            gmail_message_id: item.gmail_message_id,
            thread_id: item.thread_id,
            account_email: item.account_email,
            success: true,
            data: {
              company: llmResult.company,
              position: llmResult.position,
              status: this.normalizeStatus(llmResult.status),
              processing_time: llmResult.stage2Time || processingTime / batch.length,
              confidence: item.confidence,
              from_address: item.from_address,
              subject: item.subject
            }
          };
        } else {
          return {
            id: item.id,
            gmail_message_id: item.gmail_message_id,
            success: false,
            error: llmResult?.error || 'Failed to extract company/position'
          };
        }
      });

    } catch (error) {
      console.error('Batch processing error:', error);
      // Return failed results for all items in batch
      return batch.map(item => ({
        id: item.id,
        gmail_message_id: item.gmail_message_id,
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Process a single item using extractStage2
   */
  async processSingleItem(item, modelId, modelPath) {
    try {
      console.log(`Running LLM extraction on single email: ${item.subject}`);
      const startTime = Date.now();

      const llmResult = await extractStage2(
        modelId, 
        modelPath, 
        item.subject || '', 
        item.body || ''
      );

      const processingTime = Date.now() - startTime;
      console.log(`Single LLM extraction completed in ${processingTime}ms`);

      if (llmResult && llmResult.company && llmResult.position) {
        return {
          id: item.id,
          gmail_message_id: item.gmail_message_id,
          thread_id: item.thread_id,
          account_email: item.account_email,
          success: true,
          data: {
            company: llmResult.company,
            position: llmResult.position,
            status: this.normalizeStatus(llmResult.status),
            processing_time: llmResult.stage2Time || processingTime,
            confidence: item.confidence,
            from_address: item.from_address,
            subject: item.subject
          }
        };
      } else {
        return {
          id: item.id,
          gmail_message_id: item.gmail_message_id,
          success: false,
          error: llmResult?.error || 'Failed to extract company/position'
        };
      }

    } catch (error) {
      console.error(`Single item processing error for ${item.gmail_message_id}:`, error);
      return {
        id: item.id,
        gmail_message_id: item.gmail_message_id,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update parse status in database
   */
  async updateParseStatus(ids, status, parsedData = null, error = null) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      const updateStmt = db.prepare(`
        UPDATE classification_queue 
        SET 
          parse_status = ?,
          company = ?,
          position = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const transaction = db.transaction(() => {
        for (const id of ids) {
          updateStmt.run(
            status,
            parsedData?.company || null,
            parsedData?.position || null,
            parsedData?.status || null,
            id
          );
        }
      });

      transaction();

    } catch (error) {
      console.error('Error updating parse status:', error);
      throw error;
    } finally {
      db.close();
    }
  }

  /**
   * Create job records from successfully parsed emails
   */
  async createJobRecords(successfulItems) {
    if (successfulItems.length === 0) return;

    console.log(`Creating job records from ${successfulItems.length} parsed emails`);
    this.sendProgress('Creating job records...', 90);

    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      const insertJob = db.prepare(`
        INSERT OR IGNORE INTO jobs (
          id,
          gmail_message_id,
          company,
          position,
          status,
          date_applied,
          confidence,
          account_email,
          from_address,
          subject,
          thread_id,
          email_thread_ids,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        for (const item of successfulItems) {
          const jobId = this.generateJobId(item.data.company, item.data.position, item.account_email);
          const emailThreadIds = JSON.stringify([item.gmail_message_id]);

          insertJob.run(
            jobId,
            item.gmail_message_id,
            item.data.company,
            item.data.position,
            item.data.status || 'Applied',
            new Date().toISOString(),
            item.data.confidence,
            item.account_email,
            item.data.from_address,
            item.data.subject,
            item.thread_id,
            emailThreadIds,
            new Date().toISOString()
          );
        }
      });

      transaction();
      console.log(`Created ${successfulItems.length} job records`);

    } catch (error) {
      console.error('Error creating job records:', error);
      throw error;
    } finally {
      db.close();
    }

    this.sendProgress('Job records created', 100);
  }

  /**
   * Generate unique job ID
   */
  generateJobId(company, position, accountEmail) {
    const crypto = require('crypto');
    const input = `${company}_${position}_${accountEmail}_${Date.now()}`.toLowerCase();
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Normalize job status
   */
  normalizeStatus(status) {
    if (!status) return 'Applied';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('declin') || statusLower.includes('reject')) {
      return 'Declined';
    } else if (statusLower.includes('interview')) {
      return 'Interview';
    } else if (statusLower.includes('offer')) {
      return 'Offer';
    } else {
      return 'Applied';
    }
  }

  /**
   * Send progress updates to UI
   */
  sendProgress(message, progress) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('sync-progress', {
        stage: message,
        phase: 'parsing',
        progress: Math.min(100, Math.max(0, progress))
      });
    }
    console.log(`Progress: ${message} (${progress}%)`);
  }

  /**
   * Stop processing
   */
  stop() {
    console.log('Stopping parse queue worker...');
    this.shouldStop = true;
  }

  /**
   * Get parse queue statistics
   */
  async getParseQueueStats(accountEmail = null) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      let baseQuery = 'SELECT parse_status, COUNT(*) as count FROM classification_queue';
      const params = [];
      
      if (accountEmail) {
        baseQuery += ' WHERE account_email = ?';
        params.push(accountEmail);
      }
      
      baseQuery += ' GROUP BY parse_status';

      const stmt = db.prepare(baseQuery);
      const results = stmt.all(...params);

      const stats = {
        pending: 0,
        parsing: 0,
        parsed: 0,
        failed: 0,
        skip: 0
      };

      for (const row of results) {
        if (stats.hasOwnProperty(row.parse_status)) {
          stats[row.parse_status] = row.count;
        }
      }

      stats.total = Object.values(stats).reduce((sum, count) => sum + count, 0);

      return stats;

    } catch (error) {
      console.error('Error getting parse queue stats:', error);
      return {
        pending: 0,
        parsing: 0,
        parsed: 0,
        failed: 0,
        skip: 0,
        total: 0
      };
    } finally {
      db.close();
    }
  }

  /**
   * Retry failed parse items
   */
  async retryFailedItems(maxRetries = 50, modelId = 'llama-3-8b-instruct-q5_k_m') {
    console.log(`Retrying up to ${maxRetries} failed parse items`);

    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      // Get failed items
      const stmt = db.prepare(`
        SELECT id FROM classification_queue 
        WHERE parse_status = 'failed' AND is_job_related = 1
        ORDER BY updated_at DESC LIMIT ?
      `);
      
      const failedIds = stmt.all(maxRetries).map(row => row.id);

      if (failedIds.length === 0) {
        return { message: 'No failed items to retry' };
      }

      // Reset them to pending
      const updateStmt = db.prepare(`
        UPDATE classification_queue 
        SET parse_status = 'pending', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      const transaction = db.transaction(() => {
        for (const id of failedIds) {
          updateStmt.run(id);
        }
      });

      transaction();

      console.log(`Reset ${failedIds.length} failed items to pending`);

      // Process them
      return await this.processParseQueue({
        modelId,
        maxItems: failedIds.length
      });

    } catch (error) {
      console.error('Error retrying failed items:', error);
      throw error;
    } finally {
      db.close();
    }
  }
}

module.exports = ParseQueueWorker;