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

class ClassificationOnlyProcessor {
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    this.mlClassifier = getMLClassifier();
    this.gmailAuth = new GmailMultiAuth();
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

    try {
      // Use existing Gmail auth to fetch emails
      const authClient = await this.gmailAuth.getAuthenticatedClient(account.email);
      
      if (!authClient) {
        throw new Error(`Failed to get authenticated client for ${account.email}`);
      }

      // Calculate date range
      const since = new Date();
      since.setDate(since.getDate() - daysToSync);
      const sinceString = since.toISOString().split('T')[0].replace(/-/g, '/');

      // Build Gmail query
      let gmailQuery = `after:${sinceString}`;
      if (query && query !== 'all') {
        gmailQuery += ` ${query}`;
      }

      console.log(`Fetching emails with query: ${gmailQuery}`);

      // Fetch messages using Gmail API
      const gmail = require('googleapis').google.gmail({ version: 'v1', auth: authClient });
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: gmailQuery,
        maxResults
      });

      if (!response.data.messages) {
        console.log('No messages found');
        return [];
      }

      const messages = response.data.messages;
      console.log(`Found ${messages.length} messages to process`);

      // Fetch full message details in batches
      const emails = [];
      const batchSize = 50; // Reasonable batch size for API limits

      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        this.sendProgress(`Fetching email details (${i + 1}-${Math.min(i + batchSize, messages.length)} of ${messages.length})`, 
          Math.round((i / messages.length) * 50)); // 0-50% for fetching

        const batchEmails = await Promise.all(
          batch.map(async (message) => {
            try {
              const fullMessage = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
              });

              return this.parseGmailMessage(fullMessage.data);
            } catch (error) {
              console.error(`Error fetching message ${message.id}:`, error);
              return null;
            }
          })
        );

        emails.push(...batchEmails.filter(email => email !== null));
      }

      this.sendProgress(`Fetched ${emails.length} emails successfully`, 50);
      return emails;

    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  /**
   * Parse Gmail message into our format
   */
  parseGmailMessage(message) {
    try {
      const headers = message.payload.headers;
      const subject = this.getHeader(headers, 'subject') || '';
      const from = this.getHeader(headers, 'from') || '';
      const to = this.getHeader(headers, 'to') || '';
      const date = this.getHeader(headers, 'date') || '';

      // Extract email body
      const body = this.extractBody(message.payload);

      return {
        id: message.id,
        threadId: message.threadId,
        subject,
        from,
        to,
        date,
        body,
        internalDate: message.internalDate,
        snippet: message.snippet,
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
    
    const results = [];
    const batchSize = 10; // Process in smaller batches for progress updates

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const progress = 50 + Math.round(((i + batchSize) / emails.length) * 40); // 50-90% for classification
      
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

            return {
              email,
              classification: {
                is_job_related: mlResult.is_job_related,
                confidence: mlResult.confidence,
                needs_review: mlResult.confidence < 0.8,
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
                confidence: 0,
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
    }

    this.sendProgress('Classification complete', 90);
    return results;
  }

  /**
   * Save classification results to database
   */
  async saveToClassificationQueue(results, account) {
    console.log(`Saving ${results.length} classification results to database`);
    
    this.sendProgress('Saving results to database...', 95);

    const Database = require('better-sqlite3');
    const path = require('path');
    const { app } = require('electron');
    
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

    try {
      // Ensure tables exist
      this.createClassificationTables(db);

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
          confidence,
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
            classification.confidence,
            classification.needs_review ? 1 : 0,
            'classified',
            classification.is_job_related ? 'pending' : 'skip',
            JSON.stringify({
              snippet: email.snippet,
              labelIds: email.labelIds,
              internalDate: email.internalDate,
              date: email.date,
              to: email.to
            }),
            processed_at,
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

      transaction();
      console.log('Successfully saved classification results');

    } catch (error) {
      console.error('Error saving classification results:', error);
      throw error;
    } finally {
      db.close();
    }

    this.sendProgress('Results saved successfully', 100);
  }

  /**
   * Create classification-related database tables
   */
  createClassificationTables(db) {
    // Create classification queue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS classification_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gmail_message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        account_email TEXT NOT NULL,
        subject TEXT,
        from_address TEXT,
        body TEXT,
        is_job_related BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 0,
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
        processing_time INTEGER DEFAULT 0,
        
        FOREIGN KEY (account_email) REFERENCES gmail_accounts(email)
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

    // Create training feedback table
    db.exec(`
      CREATE TABLE IF NOT EXISTS classification_training (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gmail_message_id TEXT NOT NULL,
        original_classification BOOLEAN,
        user_correction BOOLEAN,
        confidence REAL,
        subject TEXT,
        body_snippet TEXT,
        from_address TEXT,
        feedback_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (gmail_message_id) REFERENCES classification_queue(gmail_message_id)
      )
    `);

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
    if (this.mainWindow) {
      this.mainWindow.webContents.send('sync-progress', {
        stage: message,
        phase: 'classifying',
        progress: Math.min(100, Math.max(0, progress))
      });
    }
    console.log(`Progress: ${message} (${progress}%)`);
  }

  /**
   * Get pending items that need review
   */
  async getPendingReview(accountEmail = null) {
    const Database = require('better-sqlite3');
    const path = require('path');
    const { app } = require('electron');
    
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

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
    } finally {
      db.close();
    }
  }

  /**
   * Update classification based on user review
   */
  async updateClassification(id, isJobRelated, notes = '') {
    const Database = require('better-sqlite3');
    const path = require('path');
    const { app } = require('electron');
    
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);

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

      const insertTraining = db.prepare(`
        INSERT INTO classification_training (
          gmail_message_id,
          original_classification,
          user_correction,
          confidence,
          subject,
          body_snippet,
          from_address,
          feedback_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        // Get original data for training
        const original = getOriginalData.get(id);
        if (!original) {
          throw new Error(`Classification record with ID ${id} not found`);
        }

        // Update classification
        updateClassification.run(isJobRelated ? 1 : 0, isJobRelated ? 1 : 0, notes, id);

        // Save training data if classification changed
        if ((original.is_job_related === 1) !== isJobRelated) {
          insertTraining.run(
            original.gmail_message_id,
            original.is_job_related === 1,
            isJobRelated,
            original.confidence,
            original.subject,
            (original.body || '').substring(0, 500),
            original.from_address,
            notes
          );
        }
      });

      transaction();
      console.log(`Updated classification for ID ${id}: job-related=${isJobRelated}`);
      return { success: true };

    } catch (error) {
      console.error('Error updating classification:', error);
      throw error;
    } finally {
      db.close();
    }
  }
}

module.exports = ClassificationOnlyProcessor;