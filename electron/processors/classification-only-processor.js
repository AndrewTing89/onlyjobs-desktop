/**
 * Classification-Only Email Processor
 * 
 * This processor:
 * - Fetches emails from Gmail
 * - Runs ML classification only (no LLM parsing)
 * - Saves results to email_pipeline table
 * - Marks items that need review (job_probability < 0.8)
 * - Stores classification data for later human review
 */

const { getMLClassifier } = require('../ml-classifier-bridge');
const GmailMultiAuth = require('../gmail-multi-auth');
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const DigestDetector = require('../digest-detector');
const { improvePipelineSchema } = require('../database/migrations/improve_pipeline_schema');

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
    this.digestDetector = new DigestDetector(); // Initialize digest detector
    
    // Initialize pipeline tables if needed
    this.initializePipelineTables();
  }
  
  /**
   * Initialize pipeline tables and migrate existing data
   */
  initializePipelineTables() {
    try {
      // Check if table exists and has correct schema
      const tableInfo = this.db.prepare("PRAGMA table_info(email_pipeline)").all();
      const hasIsJobRelated = tableInfo.some(col => col.name === 'is_job_related');
      
      if (tableInfo.length > 0 && !hasIsJobRelated) {
        console.log('⚠️ Old email_pipeline schema detected, recreating table...');
        // Drop old table with incorrect schema
        this.db.exec('DROP TABLE IF EXISTS email_pipeline');
        console.log('Dropped old email_pipeline table');
      }
      
      // Run pipeline schema improvement
      const improvement = improvePipelineSchema(this.db);
      if (!improvement.success) {
        console.error('Pipeline schema improvement failed:', improvement.error);
      }
    } catch (error) {
      console.error('Error initializing pipeline tables:', error);
    }
  }

  /**
   * Main entry point - classify emails with optional LLM extraction
   */
  async processEmails(account, options = {}) {
    const {
      dateFrom,
      dateTo,
      daysToSync = 30, // Fallback for backward compatibility
      query = 'is:unread OR label:job-applications',
      maxResults = options.maxEmails || 100000  // Effectively unlimited - will fetch all emails in date range
      // NO modelId - no LLM during sync, only ML classification
    } = options;

    // Build date query
    let dateQuery = '';
    if (dateFrom && dateTo) {
      // Convert dates to Gmail query format (YYYY/MM/DD)
      const fromDate = new Date(dateFrom).toISOString().split('T')[0].replace(/-/g, '/');
      const toDate = new Date(dateTo).toISOString().split('T')[0].replace(/-/g, '/');
      dateQuery = `after:${fromDate} before:${toDate}`;
    } else if (daysToSync) {
      // Fallback to days-based query
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysToSync);
      const formattedDate = fromDate.toISOString().split('T')[0].replace(/-/g, '/');
      dateQuery = `after:${formattedDate}`;
    }

    // Combine with existing query
    const fullQuery = dateQuery ? `${query} ${dateQuery}` : query;

    console.log(`Starting classification-only sync for ${account.email} with query: ${fullQuery}`);
    
    try {
      // Step 1: Fetch emails from Gmail
      const emails = await this.fetchEmails(account, {
        query: fullQuery,
        maxResults
      });

      if (emails.length === 0) {
        console.log('No emails to process');
        return {
          totalEmails: 0,
          classified: 0,
          needsReview: 0,
          digestsFiltered: 0
        };
      }

      // Step 2: Filter out job digests/newsletters
      const { filteredEmails, digestEmails, digestCount } = this.filterDigests(emails);
      console.log(`Filtered ${digestCount} digest emails out of ${emails.length} total emails`);
      
      // Step 3: Process digest emails as rejected classifications
      const digestResults = digestEmails.map(digest => ({
        email: digest.email,
        classification: {
          is_job_related: false,
          job_probability: 0,
          needs_review: false,
          ml_only: false,  // This was filtered, not ML classified
          processing_time: 0,
          model_type: 'digest_filter',
          filter_reason: digest.filterReason,
          filter_confidence: digest.filterConfidence
        },
        account_email: account.email,
        processed_at: new Date().toISOString()
      }));

      // Step 4: Run ML classification only on non-digest emails
      let mlResults = [];
      if (filteredEmails.length > 0) {
        mlResults = await this.classifyEmailsOnly(filteredEmails, account);
      }

      // Step 5: Combine all results (ML classified + digest filtered)
      const allResults = [...mlResults, ...digestResults];

      // Step 6: Save everything to pipeline
      if (allResults.length > 0) {
        await this.saveToPipeline(allResults, account);
      }

      const stats = this.calculateStats(mlResults);
      stats.digestsFiltered = digestCount;
      stats.totalEmails = emails.length;
      console.log(`Classification complete: ${stats.classified} ML classified, ${digestCount} digests filtered, ${stats.needsReview} need review`);

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
    const { query, maxResults } = options;
    
    this.sendProgress('Fetching emails from Gmail...', 0);
    this.sendActivity('fetch', `🔍 Starting email fetch for ${account.email}`, {
      account: account.email,
      maxResults: maxResults,
      query: query
    });

    try {
      // Use GmailMultiAuth's built-in method to fetch emails
      console.log(`Fetching emails for ${account.email} with options:`, options);
      
      const startTime = Date.now();
      const result = await this.gmailAuth.fetchEmailsFromAccount(account.email, {
        query: query || 'in:inbox',
        maxResults: maxResults  // Don't default to 50 - use the passed value (100000)
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
   * Filter out digest/newsletter emails
   * @param {Array} emails - Array of email objects
   * @returns {Object} - {filteredEmails: Array, digestEmails: Array, digestCount: number}
   */
  filterDigests(emails) {
    const filteredEmails = [];
    const digestEmails = [];
    let digestCount = 0;
    const digestDetails = [];

    for (const email of emails) {
      const digestResult = this.digestDetector.detectDigest({
        subject: email.subject,
        from: email.from,
        body: email.body
      });

      if (digestResult.is_digest) {
        digestCount++;
        
        // Store the digest email with filter metadata
        digestEmails.push({
          email,
          filterReason: digestResult.reason,
          filterConfidence: digestResult.confidence
        });
        
        digestDetails.push({
          subject: email.subject,
          from: email.from,
          reason: digestResult.reason,
          confidence: digestResult.confidence
        });
        
        // Send activity for each filtered digest (users like seeing the progress!)
        this.sendActivity('filter', 
          `🚫 Filtered digest: "${email.subject.substring(0, 50)}..." (${digestResult.reason})`,
          {
            emailId: email.id,
            reason: digestResult.reason,
            confidence: digestResult.confidence
          }
        );
      } else {
        filteredEmails.push(email);
      }
    }

    // Log digest statistics summary
    if (digestCount > 0) {
      // Group by reason for statistics
      const reasonCounts = {};
      for (const detail of digestDetails) {
        const baseReason = detail.reason.split(':')[0]; // Extract base reason without domain
        reasonCounts[baseReason] = (reasonCounts[baseReason] || 0) + 1;
      }
      
      // Console logging
      console.log(`Digest Filter Statistics:`);
      console.log(`  Total digests filtered: ${digestCount}`);
      console.log(`  By reason:`);
      for (const [reason, count] of Object.entries(reasonCounts)) {
        console.log(`    ${reason}: ${count}`);
      }
      
      // Show sample filtered emails
      console.log(`  Sample filtered emails:`);
      digestDetails.slice(0, 3).forEach(detail => {
        console.log(`    - "${detail.subject.substring(0, 50)}..." from ${detail.from}`);
      });
    }

    return {
      filteredEmails,
      digestEmails,
      digestCount
    };
  }

  /**
   * Run ML classification on emails with LLM extraction for job-related ones
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

            // NO LLM extraction during sync - only ML classification
            // Extraction happens AFTER human review in the Review & Extract page

            return {
              email,
              classification: {
                is_job_related: mlResult.is_job_related,
                job_probability: mlResult.job_probability,
                needs_review: mlResult.needs_review || false,
                ml_only: true, // Always ML only - no LLM during sync
                processing_time: processingTime,
                model_type: mlResult.model_type || 'ml',
                // Set filter_reason for ML-rejected emails
                filter_reason: !mlResult.is_job_related ? 'ml_not_job_related' : null
                // NO extracted details - extraction happens after human review
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
                error: error.message,
                filter_reason: 'ml_classification_error'
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
        await this.saveToPipeline(toSave, account);
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
      await this.saveToPipeline(remaining, account);
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
   * Save classification results to the pipeline table
   */
  async saveToPipeline(results, account) {
    console.log(`saveToPipeline: Starting to save ${results.length} results...`);
    const db = this.db; // Use shared connection

    try {
      // Prepare UPSERT statement for pipeline
      const upsertPipeline = db.prepare(`
        INSERT INTO email_pipeline (
          gmail_message_id,
          thread_id,
          account_email,
          from_address,
          subject,
          plaintext,
          body_html,
          date_received,
          ml_classification,
          job_probability,
          is_job_related,
          pipeline_stage,
          classification_method,
          is_classified,
          jobs_table_id,
          needs_review,
          review_reason,
          user_feedback,
          user_classification,
          reviewed_at,
          reviewed_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gmail_message_id) DO UPDATE SET
          thread_id = excluded.thread_id,
          subject = excluded.subject,
          from_address = excluded.from_address,
          plaintext = excluded.plaintext,
          body_html = excluded.body_html,
          date_received = excluded.date_received,
          ml_classification = excluded.ml_classification,
          job_probability = excluded.job_probability,
          is_job_related = excluded.is_job_related,
          pipeline_stage = excluded.pipeline_stage,
          classification_method = excluded.classification_method,
          is_classified = excluded.is_classified,
          jobs_table_id = excluded.jobs_table_id,
          needs_review = excluded.needs_review,
          review_reason = excluded.review_reason,
          user_feedback = excluded.user_feedback,
          user_classification = excluded.user_classification,
          reviewed_at = excluded.reviewed_at,
          reviewed_by = excluded.reviewed_by,
          updated_at = excluded.updated_at
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

          // Determine pipeline stage and classification method
          let pipelineStage;
          let classificationMethod;
          let humanVerified = false;
          
          // Use confidence thresholds (can be made configurable)
          const AUTO_APPROVE_THRESHOLD = 0.90;
          const NEEDS_REVIEW_THRESHOLD = 0.80;
          
          let isClassified = true;
          
          if (classification.model_type === 'digest_filter') {
            // Digest filtered emails are classified but typically not job-related
            pipelineStage = 'classified';
            classificationMethod = 'digest_filter';
          } else {
            classificationMethod = 'ml';
            const confidence = classification.job_probability || classification.confidence || 0;
            
            // All ML classifications are considered classified
            pipelineStage = 'classified';
            
            // High confidence job-related emails could potentially be auto-approved
            // but let's keep human review for now
            if (classification.is_job_related && confidence >= AUTO_APPROVE_THRESHOLD) {
              // Could set to 'ready_for_extraction' but keeping manual review
              humanVerified = true;
            }
          }

          // Convert dates
          const emailDate = email.internalDate 
            ? new Date(parseInt(email.internalDate)).toISOString()
            : email.date 
              ? new Date(email.date).toISOString()
              : new Date().toISOString();

          const now = new Date().toISOString();

          // UPSERT to pipeline (23 parameters to match new schema)
          upsertPipeline.run(
            email.id,                    // 1. gmail_message_id
            email.threadId,               // 2. thread_id
            account_email,                // 3. account_email
            email.from,                   // 4. from_address
            email.subject,                // 5. subject
            email.body,                   // 6. plaintext
            email.bodyIsHtml ? email.body : null,  // 7. body_html
            emailDate,                    // 8. date_received
            JSON.stringify({              // 9. ml_classification
              model_type: classification.model_type,
              confidence: classification.job_probability || classification.confidence || 0,
              processing_time: classification.processing_time || 0,
              features: classification.features,
              filter_reason: classification.filter_reason,
              filter_confidence: classification.filter_confidence
            }),
            classification.job_probability || classification.confidence || 0,  // 10. job_probability
            classification.is_job_related ? 1 : 0,                  // 11. is_job_related
            pipelineStage,                                          // 12. pipeline_stage
            classificationMethod,                                    // 13. classification_method
            isClassified ? 1 : 0,                                   // 14. is_classified
            null,                                                    // 15. jobs_table_id
            classification.needs_review ? 1 : 0,                    // 16. needs_review
            classification.needs_review ? 'low_confidence' : null,  // 17. review_reason
            null,                                                    // 18. user_feedback
            null,                                                    // 19. user_classification
            null,                                                    // 20. reviewed_at
            null,                                                    // 21. reviewed_by
            now,                                                     // 22. created_at
            now                                                      // 23. updated_at
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

      console.log(`saveToPipeline: Starting transaction for ${results.length} results...`);
      transaction();
      console.log(`saveToPipeline: Successfully saved ${results.length} results to pipeline`);

    } catch (error) {
      console.error('Error saving to pipeline:', error);
      throw error;
    }
  }

  // Legacy methods removed (saveToClassificationQueue and createClassificationTables)
  // These were used with the old classification_queue table
  // Now using email_pipeline table exclusively

  /**
   * Calculate statistics from results
   */
  calculateStats(results) {
    const classified = results.length;
    const jobRelated = results.filter(r => r.classification.is_job_related).length;
    const needsReview = results.filter(r => r.classification.needs_review).length;
    const highConfidence = results.filter(r => (r.classification.job_probability || r.classification.confidence || 0) >= 0.8).length;
    const lowConfidence = results.filter(r => (r.classification.job_probability || r.classification.confidence || 0) < 0.8).length;

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
        progress: progress
      });
    }
  }

  /**
   * Send activity updates to UI
   */
  sendActivity(type, message, details = {}) {
    console.log(`sendActivity called: type=${type}, hasWebContents=${!!this.webContents}`);
    if (this.webContents) {
      try {
        this.webContents.send("sync-activity", {
          type,
          message,
          details
        });
        console.log("sync-activity event sent successfully");
      } catch (error) {
        console.error("Error sending sync-activity:", error);
      }
    }
  }
}

module.exports = ClassificationOnlyProcessor;
