/**
 * Classification-Only Email Processor
 * 
 * This processor:
 * - Fetches emails from Gmail
 * - Runs ML classification only (no LLM parsing)
 * - Saves results to classification_queue table
 * - Marks items that need review (confidence < 0.8)
 * - Stores raw email content for later parsing
 */

const { getMLClassifier } = require('../ml-classifier-bridge');
const GmailMultiAuth = require('../gmail-multi-auth');
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// Shared database connection for this processor
let sharedDb = null;

function getSharedDb() {
  if (!sharedDb) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    sharedDb = new Database(dbPath);
    // Enable foreign key constraints
    sharedDb.pragma('foreign_keys = ON');
  }
  return sharedDb;
}

class ClassificationOnlyProcessor {
  constructor(webContents = null) {
    this.webContents = webContents;
    this.mlClassifier = getMLClassifier();
    this.gmailAuth = new GmailMultiAuth();
    this.db = getSharedDb(); // Use shared connection
    this.BATCH_SAVE_SIZE = 50; // Save every 50 emails
  }

  /**
   * Main entry point - classify emails without parsing
   */
  async processEmails(account, options = {}) {
    const {
      daysToSync = 30,
      query = 'is:unread OR label:job-applications',
      maxResults = 500
    } = options;

    console.log(`Starting classification-only sync for ${account.email}`);
    
    try {
      // Step 1: Fetch emails from Gmail
      const emails = await this.fetchEmails(account, {
        daysToSync,
        query,
        maxResults
      });

      if (emails.length === 0) {
        console.log('No emails to process');
        return {
          totalEmails: 0,
          classified: 0,
          needsReview: 0
        };
      }

      // Step 2: Run ML classification only
      const results = await this.classifyEmailsOnly(emails, account);

      // Step 3: Save to classification queue
      await this.saveToClassificationQueue(results, account);

      const stats = this.calculateStats(results);
      console.log(`Classification complete: ${stats.classified} classified, ${stats.needsReview} need review`);

      return stats;

    } catch (error) {
      console.error('Classification processing error:', error);
      throw error;
    }
  }

  /**
   * Fetch emails from Gmail using existing auth
   */
  async fetchEmails(account, options) {
    const { daysToSync, query, maxResults } = options;
    
    this.sendProgress('Fetching emails from Gmail...', 0);
    this.sendActivity('fetch', `🔍 Starting email fetch for ${account.email}`, {
      account: account.email,
      maxResults: maxResults,
      daysToSync: daysToSync
    });

    try {
      // Use GmailMultiAuth's built-in method to fetch emails
      console.log(`Fetching emails for ${account.email} with options:`, options);
      
      const startTime = Date.now();
      const result = await this.gmailAuth.fetchEmailsFromAccount(account.email, {
        query: query || 'in:inbox',
        maxResults: maxResults || 50
      });

      // Extract messages from the result object
      const emails = result?.messages || [];
      
      const fetchTime = Date.now() - startTime;
      
      if (emails.length === 0) {
        console.log('No messages found');
        this.sendActivity('fetch', '📭 No emails found matching criteria', {});
        return [];
      }

      console.log(`Fetched ${emails.length} emails successfully`);
      this.sendActivity('fetch', `✅ Successfully fetched ${emails.length} emails in ${fetchTime}ms`, {
        emailCount: emails.length,
        duration: fetchTime
      });
      this.sendProgress(`Fetched ${emails.length} emails successfully`, 50);
      
      // Parse the Gmail messages into our format
      console.log('Starting to parse Gmail messages...');
      this.sendActivity('parse', '🔄 Starting to parse email metadata...', {});
      
      const parseStartTime = Date.now();
      const parsedEmails = [];
      for (let i = 0; i < emails.length; i++) {
        if (i % 50 === 0) {
          console.log(`Parsing email ${i + 1} of ${emails.length}...`);
          this.sendActivity('parse', `📝 Parsing batch: ${i + 1}-${Math.min(i + 50, emails.length)} of ${emails.length}`, {
            current: i + 1,
            total: emails.length
          });
          this.sendProgress(`Parsing emails (${i + 1} of ${emails.length})...`, 20 + Math.round((i / emails.length) * 30));
        }
        const parsed = this.parseGmailMessage(emails[i]);
        if (parsed) {
          parsedEmails.push(parsed);
        }
      }
      
      const parseTime = Date.now() - parseStartTime;
      console.log(`Finished parsing ${parsedEmails.length} emails`);
      this.sendActivity('parse', `✅ Parsed ${parsedEmails.length} emails in ${parseTime}ms`, {
        emailCount: parsedEmails.length,
        duration: parseTime
      });
      
      return parsedEmails;

    } catch (error) {
      console.error('Error fetching emails:', error);
      this.sendActivity('error', `❌ Error fetching emails: ${error.message}`, {});
      throw error;
    }
  }

  /**
   * Parse Gmail message into our format (MINIMAL for ML classification only)
   */
  parseGmailMessage(message) {
    try {
      if (!message || !message.payload) {
        console.warn('Invalid message structure:', message?.id);
        return null;
      }
      
      const headers = message.payload.headers || [];
      const subject = this.getHeader(headers, 'subject') || '';
      const from = this.getHeader(headers, 'from') || '';
      const to = this.getHeader(headers, 'to') || '';
      const date = this.getHeader(headers, 'date') || '';

      // Extract full body text (plain text preferred, HTML as fallback)
      let body = '';
      let bodyIsHtml = false;
      try {
        const bodyResult = this.extractLimitedBody(message.payload, null); // null = no limit
        body = bodyResult.body;
        bodyIsHtml = bodyResult.isHtml;
        
        // If we still have no body, fall back to snippet
        if (!body) {
          body = message.snippet || '';
        }
      } catch (e) {
        console.error('Error extracting body:', e);
        // Fallback to snippet if extraction fails
        body = message.snippet || '';
      }

      return {
        id: message.id,
        threadId: message.threadId,
        subject,
        from,
        to,
        date,
        body, // Full email body (plain text or HTML)
        bodyIsHtml, // Flag to indicate if body is HTML
        internalDate: message.internalDate,
        snippet: message.snippet || '',
        labelIds: message.labelIds || []
      };
    } catch (error) {
      console.error('Error parsing Gmail message:', error);
      return null;
    }
  }

  /**
   * Get header value by name
   */
  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  /**
   * Extract limited body text - tries plain text first, falls back to HTML
   * Returns both the body and a flag indicating if it's HTML
   */
  extractLimitedBody(payload, maxLength = null) {
    if (!payload) return { body: '', isHtml: false };

    // Direct body data (single part email)
    if (payload.body && payload.body.data) {
      try {
        const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        const isHtml = payload.mimeType === 'text/html';
        return {
          body: maxLength ? decoded.substring(0, maxLength) : decoded,
          isHtml
        };
      } catch (error) {
        console.error('Error decoding body data:', error);
        return { body: '', isHtml: false };
      }
    }

    // Multipart email - try to find text/plain first
    if (payload.parts) {
      // First pass: look for plain text
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain') {
          const result = this.extractLimitedBody(part, maxLength);
          if (result.body) return result;
        }
      }

      // Second pass: look for HTML if no plain text found
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          const result = this.extractLimitedBody(part, maxLength);
          if (result.body) {
            return { body: result.body, isHtml: true };
          }
        }
      }

      // Recursive search in nested parts
      for (const part of payload.parts) {
        const result = this.extractLimitedBody(part, maxLength);
        if (result.body) return result;
      }
    }

    return { body: '', isHtml: false };
  }

  /**
   * Extract body from Gmail payload
   */
  extractBody(payload) {
    if (!payload) return '';

    // Check if this part has body data
    if (payload.body && payload.body.data) {
      try {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } catch (error) {
        console.error('Error decoding body data:', error);
        return '';
      }
    }

    // If it has parts, recursively extract from parts
    if (payload.parts) {
      for (const part of payload.parts) {
        // Prefer text/plain over text/html
        if (part.mimeType === 'text/plain') {
          const text = this.extractBody(part);
          if (text) return text;
        }
      }

      // If no plain text found, try HTML parts
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          const html = this.extractBody(part);
          if (html) {
            // Convert HTML to plain text
            const { convert } = require('html-to-text');
            return convert(html, {
              wordwrap: false,
              preserveNewlines: true
            });
          }
        }
      }

      // Try any remaining parts
      for (const part of payload.parts) {
        const text = this.extractBody(part);
        if (text) return text;
      }
    }

    return '';
  }

  /**
   * Run ML classification on emails (no LLM parsing)
   */
  async classifyEmailsOnly(emails, account) {
    console.log(`Running ML classification on ${emails.length} emails`);
    this.sendActivity('ml', `🤖 Starting ML classification for ${emails.length} emails...`, {
      totalEmails: emails.length
    });
    
    const results = [];
    const batchSize = 10; // Process in smaller batches for progress updates
    let savedCount = 0;
    const classificationStartTime = Date.now();

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const progress = 50 + Math.round(((i + batchSize) / emails.length) * 40); // 50-90% for classification
      
      this.sendActivity('ml', `⚙️ Classifying batch: ${i + 1}-${Math.min(i + batchSize, emails.length)} of ${emails.length}`, {
        current: i + 1,
        batchEnd: Math.min(i + batchSize, emails.length),
        total: emails.length
      });
      
      this.sendProgress(`Classifying emails (${i + 1}-${Math.min(i + batchSize, emails.length)} of ${emails.length})`, progress);

      // Process batch with ML classifier
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          try {
            const startTime = Date.now();
            
            // Run ML classification
            const mlResult = await this.mlClassifier.classify(
              email.subject || '',
              email.body || '',
              email.from || ''
            );

            const processingTime = Date.now() - startTime;

            // Send ML classification activity to UI
            this.sendActivity('ml', 
              `ML Classification completed in ${processingTime}ms - Job: ${mlResult.is_job_related ? 'true' : 'false'} (probability: ${mlResult.job_probability.toFixed(2)})`,
              {
                isJob: mlResult.is_job_related,
                job_probability: mlResult.job_probability,
                timing: processingTime
              }
            );

            return {
              email,
              classification: {
                is_job_related: mlResult.is_job_related,
                job_probability: mlResult.job_probability,
                needs_review: mlResult.needs_review || false,
                ml_only: true,
                processing_time: processingTime,
                model_type: mlResult.model_type || 'ml'
              },
              account_email: account.email,
              processed_at: new Date().toISOString()
            };

          } catch (error) {
            console.error(`Error classifying email ${email.id}:`, error);
            return {
              email,
              classification: {
                is_job_related: false,
                job_probability: 0,
                needs_review: true,
                ml_only: true,
                processing_time: 0,
                error: error.message
              },
              account_email: account.email,
              processed_at: new Date().toISOString()
            };
          }
        })
      );

      results.push(...batchResults);

      // Log progress
      const jobCount = batchResults.filter(r => r.classification.is_job_related).length;
      const reviewCount = batchResults.filter(r => r.classification.needs_review).length;
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${jobCount} job-related, ${reviewCount} need review`);
      
      // Save to database every BATCH_SAVE_SIZE emails
      if (results.length - savedCount >= this.BATCH_SAVE_SIZE) {
        const toSave = results.slice(savedCount, savedCount + this.BATCH_SAVE_SIZE);
        const saveBatchNum = Math.floor(savedCount / this.BATCH_SAVE_SIZE) + 1;
        const totalBatches = Math.ceil(emails.length / this.BATCH_SAVE_SIZE);
        
        this.sendActivity('database', `💾 Saving batch ${saveBatchNum}/${totalBatches} to database...`, {
          batchNum: saveBatchNum,
          totalBatches: totalBatches,
          emailsInBatch: toSave.length
        });
        
        this.sendProgress(`Saving batch ${saveBatchNum} of ${totalBatches} to database...`, progress + 2);
        
        const saveStartTime = Date.now();
        await this.saveToClassificationQueue(toSave, account);
        const saveTime = Date.now() - saveStartTime;
        
        savedCount += toSave.length;
        console.log(`Saved batch ${saveBatchNum}: ${toSave.length} emails`);
        
        this.sendActivity('database', `✅ Saved batch ${saveBatchNum}: ${toSave.length} emails in ${saveTime}ms`, {
          batchNum: saveBatchNum,
          emailsSaved: toSave.length,
          duration: saveTime
        });
      }
    }

    // Save any remaining results
    if (savedCount < results.length) {
      const remaining = results.slice(savedCount);
      const finalBatchNum = Math.floor(savedCount / this.BATCH_SAVE_SIZE) + 1;
      
      this.sendActivity('database', `💾 Saving final batch to database...`, {
        emailsInBatch: remaining.length
      });
      
      this.sendProgress(`Saving final batch to database...`, 92);
      
      const saveStartTime = Date.now();
      await this.saveToClassificationQueue(remaining, account);
      const saveTime = Date.now() - saveStartTime;
      
      console.log(`Saved final batch: ${remaining.length} emails`);
      
      this.sendActivity('database', `✅ Saved final batch: ${remaining.length} emails in ${saveTime}ms`, {
        emailsSaved: remaining.length,
        duration: saveTime
      });
    }

    const totalClassificationTime = Date.now() - classificationStartTime;
    const jobRelatedCount = results.filter(r => r.classification.is_job_related).length;
    const needsReviewCount = results.filter(r => r.classification.needs_review).length;
    
    this.sendActivity('ml', `🎯 Classification complete: ${jobRelatedCount} jobs found, ${needsReviewCount} need review (${totalClassificationTime}ms)`, {
      totalEmails: results.length,
      jobsFound: jobRelatedCount,
      needsReview: needsReviewCount,
      duration: totalClassificationTime
    });
    
    this.sendProgress('Classification complete', 95);
    return results;
  }

  /**
   * Save a batch of classification results to database
   */
  async saveToClassificationQueue(results, account) {
    console.log(`saveToClassificationQueue: Starting to save ${results.length} results...`);
    const db = this.db; // Use shared connection

    try {
      // Ensure tables exist
      this.createClassificationTables(db);
      console.log(`saveToClassificationQueue: Tables verified`);

      // Prepare statements
      const insertClassification = db.prepare(`
        INSERT OR REPLACE INTO classification_queue (
          gmail_message_id,
          thread_id,
          account_email,
          subject,
          from_address,
          body,
          is_job_related,
          job_probability,
          needs_review,
          classification_status,
          parse_status,
          raw_email_data,
          created_at,
          processing_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateEmailSync = db.prepare(`
        INSERT OR REPLACE INTO email_sync (
          gmail_message_id,
          account_email,
          processed_at,
          is_job_related
        ) VALUES (?, ?, ?, ?)
      `);

      // Begin transaction
      const transaction = db.transaction(() => {
        for (const result of results) {
          const { email, classification, account_email, processed_at } = result;

          // Store in classification queue with raw data
          insertClassification.run(
            email.id,
            email.threadId,
            account_email,
            email.subject,
            email.from,
            email.body,
            classification.is_job_related ? 1 : 0,
            classification.job_probability,
            classification.needs_review ? 1 : 0,
            'classified',
            classification.is_job_related ? 'pending' : 'skip',
            JSON.stringify({
              snippet: email.snippet,
              labelIds: email.labelIds,
              internalDate: email.internalDate,
              date: email.date,
              to: email.to,
              bodyIsHtml: email.bodyIsHtml || false // Track if body is HTML format
            }),
            new Date().toISOString(), // created_at
            classification.processing_time || 0
          );

          // Update email sync tracking
          updateEmailSync.run(
            email.id,
            account_email,
            processed_at,
            classification.is_job_related ? 1 : 0
          );
        }
      });

      console.log(`saveToClassificationQueue: Starting transaction for ${results.length} results...`);
      transaction();
      console.log(`saveToClassificationQueue: Successfully saved ${results.length} classification results`);

    } catch (error) {
      console.error('Error saving classification batch:', error);
      throw error;
    }
    // Don't close the shared connection
  }

  /**
   * Create classification-related database tables
   */
  createClassificationTables(db) {
    // Check if account_email column exists and add it if missing
    try {
      const tableInfo = db.prepare("PRAGMA table_info(classification_queue)").all();
      const hasAccountEmail = tableInfo.some(col => col.name === 'account_email');
      
      if (tableInfo.length > 0 && !hasAccountEmail) {
        console.log('Adding missing account_email column to classification_queue table');
        db.exec(`ALTER TABLE classification_queue ADD COLUMN account_email TEXT`);
      }
    } catch (e) {
      // Table doesn't exist yet, will be created below
    }
    
    // Create classification queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS classification_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gmail_message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        account_email TEXT,
        subject TEXT,
        from_address TEXT,
        body TEXT,
        is_job_related BOOLEAN DEFAULT 0,
        job_probability REAL DEFAULT 0,
        needs_review BOOLEAN DEFAULT 0,
        classification_status TEXT DEFAULT 'pending' CHECK(classification_status IN ('pending', 'classified', 'reviewed')),
        parse_status TEXT DEFAULT 'pending' CHECK(parse_status IN ('pending', 'parsing', 'parsed', 'failed', 'skip')),
        company TEXT,
        position TEXT,
        status TEXT,
        raw_email_data TEXT, -- JSON with additional email metadata
        user_feedback TEXT, -- For training data
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processing_time INTEGER DEFAULT 0
      )
    `);

    // Create indexes for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_classification_queue_account ON classification_queue(account_email);
      CREATE INDEX IF NOT EXISTS idx_classification_queue_status ON classification_queue(classification_status);
      CREATE INDEX IF NOT EXISTS idx_classification_queue_parse_status ON classification_queue(parse_status);
      CREATE INDEX IF NOT EXISTS idx_classification_queue_needs_review ON classification_queue(needs_review);
      CREATE INDEX IF NOT EXISTS idx_classification_queue_thread ON classification_queue(thread_id);
    `);

    // Training feedback table removed - will export classified data directly instead

    console.log('Classification tables created/verified');
  }

  /**
   * Calculate statistics from results
   */
  calculateStats(results) {
    const classified = results.length;
    const jobRelated = results.filter(r => r.classification.is_job_related).length;
    const needsReview = results.filter(r => r.classification.needs_review).length;
    const highConfidence = results.filter(r => r.classification.confidence >= 0.8).length;
    const lowConfidence = results.filter(r => r.classification.confidence < 0.8).length;

    return {
      totalEmails: classified,
      classified,
      jobRelated,
      nonJobRelated: classified - jobRelated,
      needsReview,
      highConfidence,
      lowConfidence,
      averageConfidence: classified > 0 
        ? results.reduce((sum, r) => sum + r.classification.confidence, 0) / classified 
        : 0
    };
  }

  /**
   * Send progress updates to UI
   */
  sendProgress(message, progress) {
    if (this.webContents) {
      this.webContents.send('sync-progress', {
        stage: message,
        phase: 'classifying',
        progress: Math.min(100, Math.max(0, progress))
      });
    }
    console.log(`Progress: ${message} (${progress}%)`);
  }

  /**
   * Send activity log to UI
   */
  sendActivity(type, message, details = {}) {
    console.log(`sendActivity called: type=${type}, hasWebContents=${!!this.webContents}`);
    if (this.webContents) {
      try {
        this.webContents.send('sync-activity', {
          type,
          message,
          details
        });
        console.log('sync-activity event sent successfully');
      } catch (error) {
        console.error('Error sending sync-activity:', error);
      }
    } else {
      console.log('No webContents available to send activity');
    }
  }

  /**
   * Get pending items that need review
   */
  async getPendingReview(accountEmail = null) {
    const db = this.db; // Use shared connection

    try {
      let query = `
        SELECT 
          id,
          gmail_message_id,
          account_email,
          subject,
          from_address,
          body,
          is_job_related,
          confidence,
          created_at
        FROM classification_queue 
        WHERE needs_review = 1 AND classification_status = 'classified'
      `;
      
      const params = [];
      if (accountEmail) {
        query += ' AND account_email = ?';
        params.push(accountEmail);
      }
      
      query += ' ORDER BY created_at DESC LIMIT 100';

      const stmt = db.prepare(query);
      const results = stmt.all(...params);

      return results.map(row => ({
        id: row.id,
        gmail_message_id: row.gmail_message_id,
        account_email: row.account_email,
        subject: row.subject,
        from: row.from_address,
        body: row.body.substring(0, 500) + (row.body.length > 500 ? '...' : ''),
        is_job_related: row.is_job_related === 1,
        confidence: row.confidence,
        created_at: row.created_at
      }));

    } catch (error) {
      console.error('Error getting pending review items:', error);
      return [];
    }
    // Don't close the shared connection
  }

  /**
   * Update classification based on user review
   */
  async updateClassification(id, isJobRelated, notes = '') {
    const db = this.db; // Use shared connection

    try {
      // Begin transaction
      const updateClassification = db.prepare(`
        UPDATE classification_queue 
        SET 
          is_job_related = ?,
          needs_review = 0,
          classification_status = 'reviewed',
          parse_status = CASE WHEN ? = 1 THEN 'pending' ELSE 'skip' END,
          user_feedback = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const getOriginalData = db.prepare(`
        SELECT gmail_message_id, is_job_related, confidence, subject, body, from_address 
        FROM classification_queue 
        WHERE id = ?
      `);

      const transaction = db.transaction(() => {
        // Get original data
        const original = getOriginalData.get(id);
        if (!original) {
          throw new Error(`Classification record with ID ${id} not found`);
        }

        // Update classification
        updateClassification.run(isJobRelated ? 1 : 0, isJobRelated ? 1 : 0, notes, id);
      });

      transaction();
      console.log(`Updated classification for ID ${id}: job-related=${isJobRelated}`);
      return { success: true };

    } catch (error) {
      console.error('Error updating classification:', error);
      throw error;
    }
    // Don't close the shared connection
  }
}

module.exports = ClassificationOnlyProcessor;