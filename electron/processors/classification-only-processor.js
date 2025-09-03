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
const fs = require('fs');
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
    
    // Cache for successful extractions to prevent overwriting
    this.extractionCache = new Map();
    
    // Initialize log file (overwrites previous log)
    this.initializeLogFile();
    
    // Initialize pipeline tables if needed
    this.initializePipelineTables();
  }
  
  /**
   * Initialize log file for sync debugging - overwrites previous log
   */
  initializeLogFile() {
    try {
      const userDataPath = app.getPath('userData');
      this.logFilePath = path.join(userDataPath, 'sync-debug.log');
      
      // Create or overwrite the log file
      const timestamp = new Date().toISOString();
      const header = `=== OnlyJobs Sync Debug Log ===\nSync started at: ${timestamp}\n\n`;
      fs.writeFileSync(this.logFilePath, header);
      
      console.log(`📝 Debug log file initialized: ${this.logFilePath}`);
      this.logWithFile(`📝 Debug log file initialized: ${this.logFilePath}`);
    } catch (error) {
      console.error('Failed to initialize log file:', error);
      this.logFilePath = null;
    }
  }
  
  /**
   * Log to both console and file
   */
  logWithFile(message) {
    console.log(message);
    if (this.logFilePath) {
      try {
        const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS format
        fs.appendFileSync(this.logFilePath, `[${timestamp}] ${message}\n`);
      } catch (error) {
        // Silently fail to avoid disrupting sync
      }
    }
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
      query = 'in:inbox OR in:sent',
      maxResults = options.maxEmails || 100000  // Effectively unlimited - will fetch all emails in date range
      // NO modelId - no LLM during sync, only ML classification
    } = options;

    // Build date query
    let dateQuery = '';
    if (dateFrom && dateTo) {
      // Convert dates to Gmail query format (YYYY/MM/DD)
      const fromDate = new Date(dateFrom).toISOString().split('T')[0].replace(/-/g, '/');
      
      // Add 1 day to toDate to include the entire end date regardless of timezone
      const toDateObj = new Date(dateTo);
      toDateObj.setDate(toDateObj.getDate() + 1);
      const toDate = toDateObj.toISOString().split('T')[0].replace(/-/g, '/');
      
      dateQuery = `after:${fromDate} before:${toDate}`;
      console.log(`Date range adjusted for timezone: ${dateFrom} to ${dateTo} → Gmail query: after:${fromDate} before:${toDate}`);
    } else if (daysToSync) {
      // Fallback to days-based query
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysToSync);
      const formattedDate = fromDate.toISOString().split('T')[0].replace(/-/g, '/');
      dateQuery = `after:${formattedDate}`;
    }

    // Combine with existing query
    const fullQuery = dateQuery ? `${query} ${dateQuery}` : query;

    this.logWithFile(`🔍 Starting classification-only sync for ${account.email} with query: ${fullQuery}`);
    
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

      // Step 2: Filter out already-processed emails
      const { newEmails, skippedCount } = this.filterAlreadyProcessed(emails, account);
      console.log(`Filtered out ${skippedCount} already-processed emails, ${newEmails.length} emails remaining`);
      
      this.sendActivity('filter', `⏭️ Skipped ${skippedCount} already-processed emails, processing ${newEmails.length} new emails`, {
        totalEmails: emails.length,
        skippedEmails: skippedCount,
        newEmails: newEmails.length
      });
      
      if (newEmails.length === 0) {
        console.log('No new emails to process - all emails already classified');
        return {
          totalEmails: emails.length,
          classified: 0,
          needsReview: 0,
          digestsFiltered: 0,
          skipped: skippedCount
        };
      }

      // Step 3: Filter out job digests/newsletters
      const { filteredEmails, digestEmails, digestCount } = this.filterDigests(newEmails);
      console.log(`Filtered ${digestCount} digest emails out of ${newEmails.length} total emails`);
      
      // Debug: Check if LinkedIn emails survived digest filtering
      const linkedInAfterDigest = filteredEmails.filter(email => 
        email.from?.toLowerCase().includes('linkedin') || 
        email.subject?.toLowerCase().includes('finezi') ||
        email.from?.toLowerCase().includes('finezi')
      );
      const linkedInDigested = digestEmails.filter(digest => 
        digest.email.from?.toLowerCase().includes('linkedin') || 
        digest.email.subject?.toLowerCase().includes('finezi') ||
        digest.email.from?.toLowerCase().includes('finezi')
      );
      this.logWithFile(`🔍 DEBUG: LinkedIn/Finezi emails after digest filtering: ${linkedInAfterDigest.length} kept, ${linkedInDigested.length} digested`);
      linkedInDigested.forEach(digest => {
        const digestInfo = {
          subject: digest.email.subject?.substring(0, 60),
          from: digest.email.from?.substring(0, 50),
          reason: digest.filterReason
        };
        this.logWithFile(`📧 LinkedIn/Finezi email DIGESTED: ${JSON.stringify(digestInfo)}`);
      });
      
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
      stats.skipped = skippedCount;
      console.log(`Classification complete: ${stats.classified} ML classified, ${digestCount} digests filtered, ${skippedCount} emails skipped (already processed), ${stats.needsReview} need review`);

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
      
      // Debug: Look for LinkedIn emails in Gmail response
      const linkedInEmails = emails.filter(email => {
        const subject = email.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
        const from = email.payload?.headers?.find(h => h.name === 'From')?.value || '';
        return from.toLowerCase().includes('linkedin') || subject.toLowerCase().includes('finezi');
      });
      this.logWithFile(`🔍 DEBUG: LinkedIn/Finezi emails in Gmail response: ${linkedInEmails.length}`);
      linkedInEmails.forEach(email => {
        const subject = email.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
        const from = email.payload?.headers?.find(h => h.name === 'From')?.value || '';
        const date = email.payload?.headers?.find(h => h.name === 'Date')?.value || '';
        const emailInfo = {
          subject: subject.substring(0, 60),
          from: from.substring(0, 50),
          date: date,
          internalDate: email.internalDate ? new Date(parseInt(email.internalDate)).toISOString() : 'N/A'
        };
        this.logWithFile(`📧 LinkedIn/Finezi email found: ${JSON.stringify(emailInfo)}`);
      });
      
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
      
      // Process emails in batches to handle async properly
      const batchSize = 50;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const batchEnd = Math.min(i + batchSize, emails.length);
        
        console.log(`Parsing batch ${i + 1}-${batchEnd} of ${emails.length}...`);
        this.sendActivity('parse', `📝 Parsing batch: ${i + 1}-${batchEnd} of ${emails.length}`, {
          current: i + 1,
          batchEnd: batchEnd,
          total: emails.length
        });
        this.sendProgress(`Parsing emails (${i + 1}-${batchEnd} of ${emails.length})...`, 20 + Math.round(((i + batchSize) / emails.length) * 30));
        
        // Parse batch with proper async handling
        const batchResults = await Promise.allSettled(
          batch.map(async (email) => {
            try {
              return await this.parseGmailMessage(email);
            } catch (error) {
              console.error(`Error parsing email ${email.id}:`, error);
              return null;
            }
          })
        );
        
        // Add successful results to parsed emails
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            parsedEmails.push(result.value);
          }
        });
      }
      
      const parseTime = Date.now() - parseStartTime;
      console.log(`Finished parsing ${parsedEmails.length} emails`);
      
      // Debug: Check if LinkedIn emails survived parsing
      const parsedLinkedInEmails = parsedEmails.filter(email => 
        email.from?.toLowerCase().includes('linkedin') || 
        email.subject?.toLowerCase().includes('finezi') ||
        email.from?.toLowerCase().includes('finezi')
      );
      this.logWithFile(`🔍 DEBUG: LinkedIn/Finezi emails after parsing: ${parsedLinkedInEmails.length}`);
      parsedLinkedInEmails.forEach(email => {
        const emailInfo = {
          subject: email.subject?.substring(0, 60),
          from: email.from?.substring(0, 50),
          date: email.date,
          internalDate: email.internalDate
        };
        this.logWithFile(`📧 Parsed LinkedIn/Finezi email: ${JSON.stringify(emailInfo)}`);
      });
      
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
  async parseGmailMessage(message) {
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
        
        // Debug logging for LinkedIn/Finezi emails
        const isLinkedInEmail = from.toLowerCase().includes('linkedin');
        const isFineziBatch = subject.toLowerCase().includes('finezi') || 
                             subject.toLowerCase().includes('milestone') ||
                             body.toLowerCase().includes('finezi') ||
                             body.toLowerCase().includes('milestone');
        
        if (isLinkedInEmail && isFineziBatch) {
          this.logWithFile(`🔍 LINKEDIN EMAIL DEBUG - Subject: ${subject}`);
          this.logWithFile(`🔍 Raw body length: ${body.length}, isHtml: ${bodyIsHtml}`);
          this.logWithFile(`🔍 Raw body content (first 500 chars): ${body.substring(0, 500)}`);
          this.logWithFile(`🔍 Gmail snippet: ${message.snippet}`);
        }
        
        // Check if this looks like an incomplete LinkedIn rejection email
        if (this.isIncompleteLinkedInEmail(body, subject, from)) {
          this.logWithFile(`🔍 RAW FALLBACK: Detected incomplete LinkedIn email, trying RAW format`);
          
          try {
            const rawBodyResult = await this.extractFromRawFormat(message.id);
            if (rawBodyResult && rawBodyResult.body && rawBodyResult.body.length > 50) {
              // For LinkedIn rejection emails, prioritize quality over length
              // RAW extraction gives us clean rejection content vs truncated LinkedIn footer
              const isLinkedInRejection = subject && subject.toLowerCase().includes('application');
              const shouldUseRaw = isLinkedInRejection || rawBodyResult.body.length > body.length + 100;
              
              if (shouldUseRaw) {
                this.logWithFile(`🔍 RAW FALLBACK: Using RAW content - Quality over length for rejection emails`);
                this.logWithFile(`🔍 RAW FALLBACK: Original length: ${body.length}, RAW length: ${rawBodyResult.body.length}`);
                this.logWithFile(`🔍 RAW FALLBACK: RAW content preview: ${rawBodyResult.body.substring(0, 500)}`);
                
                body = rawBodyResult.body;
                bodyIsHtml = rawBodyResult.isHtml;
                
                // Log successful integration for rejection emails
                if (subject && (subject.includes('Finezi') || subject.includes('Milestone'))) {
                  this.logWithFile(`🔍 RAW INTEGRATION: Using RAW-extracted content for ${subject.substring(0, 60)}`);
                  this.logWithFile(`🔍 RAW INTEGRATION: Final body length: ${body.length}`);
                  this.logWithFile(`🔍 RAW INTEGRATION: Preview: ${body.substring(0, 300)}`);
                }
              } else {
                this.logWithFile(`🔍 RAW FALLBACK: RAW content not better, keeping original`);
              }
            } else {
              this.logWithFile(`🔍 RAW FALLBACK: RAW format didn't provide additional content`);
            }
          } catch (rawError) {
            this.logWithFile(`🔍 RAW FALLBACK: Error fetching RAW format: ${rawError.message}`);
          }
        }
        
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

    // Debug logging for complex email structures
    const debugMimeStructure = (payload, depth = 0) => {
      if (depth > 3) return; // Prevent infinite recursion
      const indent = '  '.repeat(depth);
      this.logWithFile(`🔍 MIME DEBUG ${indent}mimeType: ${payload.mimeType}, hasBody: ${!!payload.body?.data}, hasParts: ${!!payload.parts?.length}`);
      if (payload.parts) {
        payload.parts.forEach((part, index) => {
          this.logWithFile(`🔍 MIME DEBUG ${indent}Part ${index}:`);
          debugMimeStructure(part, depth + 1);
        });
      }
    };

    // Enable debug for LinkedIn emails
    const isLinkedInEmail = this.isLinkedInEmailPayload(payload);
    if (isLinkedInEmail) {
      this.logWithFile(`🔍 MIME DEBUG: Analyzing LinkedIn email structure`);
      debugMimeStructure(payload);
    }

    // Strategy 1: Direct body data (single part email)
    if (payload.body && payload.body.data) {
      try {
        const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        const isHtml = payload.mimeType === 'text/html';
        
        if (isLinkedInEmail) {
          this.logWithFile(`🔍 MIME DEBUG: Found direct body content, length: ${decoded.length}, isHtml: ${isHtml}`);
          this.logWithFile(`🔍 MIME DEBUG: Content preview: ${decoded.substring(0, 200)}`);
        }
        
        return {
          body: maxLength ? decoded.substring(0, maxLength) : decoded,
          isHtml
        };
      } catch (error) {
        console.error('Error decoding body data:', error);
        return { body: '', isHtml: false };
      }
    }

    // Strategy 2: Enhanced multipart traversal for LinkedIn emails
    if (payload.parts) {
      const allParts = this.getAllMessageParts(payload);
      
      if (isLinkedInEmail) {
        this.logWithFile(`🔍 MIME DEBUG: Found ${allParts.length} total parts in email`);
      }

      // Priority 1: Look for text/plain parts (more readable for LinkedIn)
      // For LinkedIn emails, we need to select the RIGHT text/plain part
      const textParts = allParts.filter(part => part.mimeType === 'text/plain' && part.body?.data);
      
      for (const part of textParts) {
        try {
          const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
          if (decoded.length > 100) { // Skip short/empty parts
            if (isLinkedInEmail) {
              this.logWithFile(`🔍 MIME DEBUG: Found text/plain content, length: ${decoded.length}`);
              this.logWithFile(`🔍 MIME DEBUG: Content preview: ${decoded.substring(0, 300)}`);
              
              // Check if this part contains rejection/application content vs footer
              const hasRejectionContent = this.hasRejectionContent(decoded);
              const hasFooterContent = this.hasLinkedInFooterContent(decoded);
              
              this.logWithFile(`🔍 MIME DEBUG: Has rejection content: ${hasRejectionContent}, has footer: ${hasFooterContent}`);
              
              // For LinkedIn emails, prefer parts with rejection content over footer-only parts
              if (hasRejectionContent && !hasFooterContent) {
                this.logWithFile(`🔍 MIME DEBUG: Selected part with rejection content (length: ${decoded.length})`);
                return {
                  body: maxLength ? decoded.substring(0, maxLength) : decoded,
                  isHtml: false
                };
              } else if (!hasFooterContent && decoded.length > 500) {
                // If no rejection keywords but substantial content and no footer, use it
                this.logWithFile(`🔍 MIME DEBUG: Selected substantial non-footer part (length: ${decoded.length})`);
                return {
                  body: maxLength ? decoded.substring(0, maxLength) : decoded,
                  isHtml: false
                };
              }
            } else {
              // For non-LinkedIn emails, use the first substantial text/plain part
              return {
                body: maxLength ? decoded.substring(0, maxLength) : decoded,
                isHtml: false
              };
            }
          }
        } catch (error) {
          console.error('Error decoding text/plain part:', error);
        }
      }
      
      // If no preferred parts found for LinkedIn, fall back to any text/plain part
      if (isLinkedInEmail) {
        this.logWithFile(`🔍 MIME DEBUG: No preferred parts found, using fallback text/plain`);
        for (const part of textParts) {
          try {
            const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (decoded.length > 100) {
              this.logWithFile(`🔍 MIME DEBUG: Fallback part length: ${decoded.length}`);
              return {
                body: maxLength ? decoded.substring(0, maxLength) : decoded,
                isHtml: false
              };
            }
          } catch (error) {
            // Skip this part
          }
        }
      }

      // Priority 2: Look for text/html parts and convert to text
      for (const part of allParts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          try {
            const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (decoded.length > 100) { // Skip short/empty parts
              if (isLinkedInEmail) {
                this.logWithFile(`🔍 MIME DEBUG: Found text/html content, length: ${decoded.length}`);
                this.logWithFile(`🔍 MIME DEBUG: HTML preview: ${decoded.substring(0, 300)}`);
              }
              return {
                body: maxLength ? decoded.substring(0, maxLength) : decoded,
                isHtml: true
              };
            }
          } catch (error) {
            console.error('Error decoding text/html part:', error);
          }
        }
      }

      // Priority 3: Look for any part with substantial content
      for (const part of allParts) {
        if (part.body?.data) {
          try {
            const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (decoded.length > 200 && !decoded.match(/^[\s\n\r]*$/)) { // Skip whitespace-only
              if (isLinkedInEmail) {
                this.logWithFile(`🔍 MIME DEBUG: Found fallback content in ${part.mimeType}, length: ${decoded.length}`);
              }
              return {
                body: maxLength ? decoded.substring(0, maxLength) : decoded,
                isHtml: part.mimeType === 'text/html'
              };
            }
          } catch (error) {
            console.error('Error decoding fallback part:', error);
          }
        }
      }
    }

    if (isLinkedInEmail) {
      this.logWithFile(`🔍 MIME DEBUG: No content found in any parts`);
    }

    return { body: '', isHtml: false };
  }

  /**
   * Recursively collect all message parts from MIME structure
   */
  getAllMessageParts(payload) {
    const parts = [];
    
    const collectParts = (part) => {
      if (!part) return;
      
      // Add current part if it has data
      if (part.body?.data || part.mimeType) {
        parts.push(part);
      }
      
      // Recursively collect from nested parts
      if (part.parts) {
        part.parts.forEach(collectParts);
      }
    };
    
    collectParts(payload);
    return parts;
  }

  /**
   * Check if this payload is from a LinkedIn email
   */
  isLinkedInEmailPayload(payload) {
    // Simple heuristic - look for LinkedIn in the MIME structure or common LinkedIn patterns
    const checkForLinkedIn = (part) => {
      if (!part) return false;
      
      // Check for LinkedIn domains in any data
      if (part.body?.data) {
        try {
          const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
          if (decoded.includes('linkedin.com') || decoded.includes('This email was intended for')) {
            return true;
          }
        } catch (e) {
          // Ignore decode errors
        }
      }
      
      // Check nested parts
      if (part.parts) {
        return part.parts.some(checkForLinkedIn);
      }
      
      return false;
    };
    
    return checkForLinkedIn(payload);
  }

  /**
   * Check if text content contains rejection or application-related keywords
   */
  hasRejectionContent(text) {
    const rejectionKeywords = [
      'unfortunately', 'regret to inform', 'not moving forward', 'not proceeding',
      'position has been filled', 'decided to move', 'decided to go', 'decided to proceed',
      'thank you for your interest', 'thank you for applying', 'application was', 
      'application to', 'application status', 'application update', 'regarding your application',
      'after careful consideration', 'we have decided', 'we will not be',
      'other candidates', 'different direction', 'not selected', 'not the right fit'
    ];
    
    const lowerText = text.toLowerCase();
    return rejectionKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Check if text content is primarily LinkedIn footer/unsubscribe content
   */
  hasLinkedInFooterContent(text) {
    const footerKeywords = [
      'this email was intended for',
      'unsubscribe',
      'update your email preferences',
      'linkedin corporation',
      'you\'re receiving this email because',
      'if you no longer wish',
      'member directory',
      'privacy policy'
    ];
    
    const lowerText = text.toLowerCase();
    const footerCount = footerKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
    // Consider it footer content if it has multiple footer keywords and is relatively short
    // OR if most of the content (>50%) matches footer patterns
    const hasMultipleFooterKeywords = footerCount >= 2;
    const isShortText = text.length < 1000;
    
    return hasMultipleFooterKeywords && (isShortText || footerCount >= 3);
  }

  /**
   * Detect if a LinkedIn email appears to be incomplete (only has header/footer)
   */
  isIncompleteLinkedInEmail(body, subject, from) {
    // Must be from LinkedIn
    if (!from.toLowerCase().includes('linkedin')) {
      return false;
    }
    
    // Check for 'update' pattern in subject or body (simpler and more general)
    const hasUpdate = subject.toLowerCase().includes('update') ||
                     body.toLowerCase().includes('update');
    
    if (!hasUpdate) {
      return false;
    }
    
    // Look for signs of incomplete content:
    // 1. Contains LinkedIn footer patterns
    // 2. Relatively short content (< 3000 chars)
    // 3. Contains "This email was intended for" but missing substantial content
    const hasFooter = body.includes('This email was intended for') ||
                     body.includes('You are receiving LinkedIn notification emails') ||
                     body.includes('Unsubscribe:');
    
    const isShort = body.length < 3000;
    
    // Look for rejection/update patterns that should have more content
    const isUpdateEmail = subject.toLowerCase().includes('update from') ||
                         body.includes('Your update from');
    
    // Missing substantial content indicators
    const lacksContent = !body.includes('Thank you for your interest') &&
                        !body.includes('Unfortunately') &&
                        !body.includes('we will not be moving forward') &&
                        !body.includes('we regret') &&
                        !body.includes('position has been filled');
    
    const seemsIncomplete = hasFooter && isShort && isUpdateEmail && lacksContent;
    
    return seemsIncomplete;
  }

  /**
   * Parse RAW MIME email content with boundary parsing and quoted-printable decoding
   */
  parseRawMimeContent(rawEmail) {
    try {
      this.logWithFile(`🔍 MIME RAW: Starting MIME parsing`);
      
      // Split headers from body
      const emailParts = rawEmail.split(/\r?\n\r?\n/);
      if (emailParts.length < 2) {
        return null;
      }
      
      const headers = emailParts[0];
      const body = emailParts.slice(1).join('\n\n');
      
      // Look for Content-Type and boundary in headers
      const contentTypeMatch = headers.match(/Content-Type:\s*([^;\r\n]+)(?:;\s*boundary=([^\r\n]+))?/i);
      const boundary = contentTypeMatch && contentTypeMatch[2] ? contentTypeMatch[2].replace(/['"]/g, '') : null;
      
      this.logWithFile(`🔍 MIME RAW: Boundary found: ${boundary}`);
      
      if (!boundary) {
        // No boundary, try to decode as single part
        return this.decodeEmailContent(body, headers);
      }
      
      // Parse multipart content with boundary
      const boundaryStr = `--${boundary}`;
      const parts = body.split(boundaryStr);
      
      this.logWithFile(`🔍 MIME RAW: Found ${parts.length} parts`);
      
      // Find the best text content
      let bestTextContent = null;
      let bestHtmlContent = null;
      
      for (const part of parts) {
        if (part.trim().length < 10) continue;
        
        // Extract part headers and content
        const partParts = part.split(/\r?\n\r?\n/);
        if (partParts.length < 2) continue;
        
        const partHeaders = partParts[0];
        const partContent = partParts.slice(1).join('\n\n');
        
        this.logWithFile(`🔍 MIME RAW: Part headers: ${partHeaders.substring(0, 200)}`);
        
        if (partHeaders.includes('Content-Type: text/plain')) {
          const decoded = this.decodeEmailContent(partContent, partHeaders);
          if (decoded && decoded.body.length > 100) {
            bestTextContent = decoded;
            this.logWithFile(`🔍 MIME RAW: Found text/plain content, length: ${decoded.body.length}`);
          }
        } else if (partHeaders.includes('Content-Type: text/html')) {
          const decoded = this.decodeEmailContent(partContent, partHeaders);
          if (decoded && decoded.body.length > 100) {
            bestHtmlContent = decoded;
            this.logWithFile(`🔍 MIME RAW: Found text/html content, length: ${decoded.body.length}`);
          }
        }
      }
      
      // Prefer text/plain over text/html
      const result = bestTextContent || bestHtmlContent;
      if (result) {
        this.logWithFile(`🔍 MIME RAW: Selected content preview: ${result.body.substring(0, 200)}`);
      }
      
      return result;
      
    } catch (error) {
      this.logWithFile(`🔍 MIME RAW: Error parsing MIME content: ${error.message}`);
      return null;
    }
  }

  /**
   * Decode email content (handles quoted-printable and base64)
   */
  decodeEmailContent(content, headers) {
    try {
      let decoded = content;
      
      // Check for quoted-printable encoding
      if (headers.includes('quoted-printable')) {
        this.logWithFile(`🔍 DECODE: Applying quoted-printable decoding`);
        decoded = this.decodeQuotedPrintable(content);
      }
      // Check for base64 encoding
      else if (headers.includes('base64')) {
        this.logWithFile(`🔍 DECODE: Applying base64 decoding`);
        try {
          decoded = Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf-8');
        } catch (b64Error) {
          this.logWithFile(`🔍 DECODE: Base64 decode failed: ${b64Error.message}`);
          decoded = content; // Fallback to original
        }
      }
      
      // Clean up the content
      decoded = decoded.trim();
      
      // Remove any remaining MIME artifacts
      decoded = decoded.replace(/^--.*?$/gm, ''); // Remove boundary lines
      decoded = decoded.replace(/Content-[^:]+:[^\r\n]*[\r\n]*/gi, ''); // Remove Content-* headers
      decoded = decoded.trim();
      
      // For LinkedIn emails, extract only the essential rejection message
      if (headers.includes('linkedin') || decoded.includes('linkedin')) {
        decoded = this.extractEssentialRejectionMessage(decoded);
      }
      
      const isHtml = decoded.includes('<html') || decoded.includes('<HTML') || headers.includes('text/html');
      
      return {
        body: decoded,
        isHtml: isHtml
      };
      
    } catch (error) {
      this.logWithFile(`🔍 DECODE: Error decoding content: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract clean plaintext from email with intelligent LinkedIn handling
   */
  extractCleanPlaintext(email) {
    // Check cache first to avoid re-processing successfully extracted content
    if (this.extractionCache.has(email.id)) {
      const cachedResult = this.extractionCache.get(email.id);
      
      // Debug logging for cached results
      if (email.subject && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
        this.logWithFile(`🔍 CACHE HIT - Subject: ${email.subject.substring(0, 60)}`);
        this.logWithFile(`🔍 CACHE HIT - Using cached result (length: ${cachedResult.length})`);
        this.logWithFile(`🔍 CACHE HIT - Content preview: ${cachedResult.substring(0, 200)}`);
      }
      
      return cachedResult;
    }
    
    // Detect LinkedIn rejection emails with truncated content - skip processing to preserve RAW extraction
    const isLinkedInEmail = (email.from || '').toLowerCase().includes('linkedin');
    const isApplicationEmail = (email.subject || '').toLowerCase().includes('application') ||
                              (email.subject || '').toLowerCase().includes('update from') ||
                              (email.body || '').toLowerCase().includes('your application');
    const bodyLength = (email.body || '').length;
    
    if (isLinkedInEmail && isApplicationEmail && bodyLength < 5000) {
      // This is likely truncated content - skip processing to preserve RAW extraction results
      if (email.subject && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
        this.logWithFile(`🔍 SKIP TRUNCATED - Subject: ${email.subject.substring(0, 60)}`);
        this.logWithFile(`🔍 SKIP TRUNCATED - Body length: ${bodyLength} (too short, likely truncated)`);
        this.logWithFile(`🔍 SKIP TRUNCATED - Preserving RAW extraction results`);
      }
      
      // Return the truncated body as-is - this will be overwritten by RAW extraction anyway
      // The important thing is we don't run the extraction logic that produces dashes
      return email.body || '';
    }
    
    // Debug logging for LinkedIn emails to understand the flow
    
    if (isLinkedInEmail && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
      this.logWithFile(`🔍 EXTRACT FLOW DEBUG - Subject: ${email.subject}`);
      this.logWithFile(`🔍 EXTRACT FLOW DEBUG - bodyIsHtml: ${email.bodyIsHtml}`);
      this.logWithFile(`🔍 EXTRACT FLOW DEBUG - isLinkedInEmail: ${isLinkedInEmail}`);
      this.logWithFile(`🔍 EXTRACT FLOW DEBUG - isApplicationEmail: ${isApplicationEmail}`);
      this.logWithFile(`🔍 EXTRACT FLOW DEBUG - Body length: ${email.body ? email.body.length : 0}`);
    }

    let extractedText = '';

    if (!email.bodyIsHtml) {
      // Already plain text - but for LinkedIn emails, we still need to extract the essential message
      if (isLinkedInEmail && isApplicationEmail) {
        extractedText = this.extractEssentialRejectionMessage(email.body || '');
        
        // Debug logging
        if (email.subject && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
          this.logWithFile(`🔍 EXTRACT DEBUG (plaintext) - Subject: ${email.subject.substring(0, 60)}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (plaintext) - Original length: ${(email.body || '').length}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (plaintext) - Final length: ${extractedText.length}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (plaintext) - Final content: ${extractedText.substring(0, 300)}`);
        }
      } else {
        extractedText = email.body || '';
      }
    } else {
      // For LinkedIn emails, use intelligent extraction
      if (isLinkedInEmail && isApplicationEmail) {
        // First strip HTML tags to get basic text
        let plaintext = this.stripHtmlTags(email.body);
        
        // Then apply LinkedIn-specific extraction
        extractedText = this.extractEssentialRejectionMessage(plaintext);
        
        // Debug logging
        if (email.subject && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
          this.logWithFile(`🔍 EXTRACT DEBUG (html) - Subject: ${email.subject.substring(0, 60)}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (html) - Original length: ${email.body.length}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (html) - Final length: ${extractedText.length}`);
          this.logWithFile(`🔍 EXTRACT DEBUG (html) - Final content: ${extractedText.substring(0, 300)}`);
        }
      } else {
        // For non-LinkedIn emails, just strip HTML tags
        extractedText = this.stripHtmlTags(email.body);
      }
    }

    // Cache ALL LinkedIn rejection email extractions (good or bad) to prevent overwriting
    if (isLinkedInEmail && isApplicationEmail) {
      this.extractionCache.set(email.id, extractedText);
      
      if (email.subject && (email.subject.includes('Finezi') || email.subject.includes('Milestone'))) {
        this.logWithFile(`🔍 CACHE SET - Cached extraction for ${email.id} (length: ${extractedText.length})`);
      }
    }

    return extractedText;
  }

  /**
   * Extract only the essential rejection message from LinkedIn emails
   */
  extractEssentialRejectionMessage(content) {
    try {
      this.logWithFile(`🔍 EXTRACT: Starting LinkedIn RAW rejection message extraction`);
      this.logWithFile(`🔍 EXTRACT: Input content length: ${content.length}`);
      
      // Step 1: Clean up quoted-printable encoding first  
      let cleaned = content;
      cleaned = cleaned.replace(/=3D/g, '='); // =3D is '=' in quoted-printable
      cleaned = cleaned.replace(/=20/g, ' '); // =20 is space in quoted-printable
      cleaned = cleaned.replace(/=\r?\n/g, ''); // Remove quoted-printable soft line breaks
      cleaned = cleaned.replace(/&middot;/g, '·'); // HTML entity for middle dot
      cleaned = cleaned.replace(/&amp;/g, '&'); // HTML entity for ampersand
      
      this.logWithFile(`🔍 EXTRACT: Cleaned quoted-printable encoding`);
      
      // Step 2: Find the actual rejection message content
      // Look for patterns that indicate the start of the real message
      const rejectionPatterns = [
        /Thank you for your interest in the ([^.]+) position at ([^.]+)\./i,
        /Thank you for your interest in our ([^.]+) position/i,
        /Thank you for applying to ([^.]+) at ([^.]+)/i,
        /We appreciate your interest in the ([^.]+) role/i,
        /Thank you for your application to ([^.]+)/i
      ];
      
      let messageStart = -1;
      let messageMatch = null;
      
      for (const pattern of rejectionPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
          messageStart = match.index;
          messageMatch = match;
          this.logWithFile(`🔍 EXTRACT: Found rejection message start: "${match[0]}"`);
          break;
        }
      }
      
      if (messageStart === -1) {
        this.logWithFile(`🔍 EXTRACT: Could not find rejection message pattern, using fallback`);
        // Fallback to looking after "Your update from"
        const fallbackPattern = /Your update from [^.\n]+\.?\s*/i;
        const fallbackMatch = cleaned.match(fallbackPattern);
        if (fallbackMatch) {
          messageStart = fallbackMatch.index + fallbackMatch[0].length;
          this.logWithFile(`🔍 EXTRACT: Using fallback: content after company header`);
        } else {
          // Last resort - find content start with old method
          const startPattern = /(Your application to|Your update from)\s+([^=\n]+)/i;
          const startMatch = cleaned.match(startPattern);
          if (startMatch) {
            messageStart = startMatch.index;
            this.logWithFile(`🔍 EXTRACT: Using old method as final fallback`);
          } else {
            this.logWithFile(`🔍 EXTRACT: No fallback worked, returning original`);
            return content;
          }
        }
      }
      
      // Step 3: Find where the message ends (before LinkedIn footer)
      const endPatterns = [
        /--\s*This email was intended for/i,
        /--\s*Learn why we included this/i,
        /Top jobs looking for your skills/i,
        /LinkedIn Corporation/i,
        /This email was intended for Andrew Ting/i,
        /See more jobs/i,
        /Get the new LinkedIn/i
      ];
      
      let messageEnd = cleaned.length;
      for (const pattern of endPatterns) {
        const match = cleaned.match(pattern);
        if (match && match.index > messageStart) {
          messageEnd = match.index;
          this.logWithFile(`🔍 EXTRACT: Found message end: "${match[0].substring(0, 30)}..."`);
          break;
        }
      }
      
      // Step 4: Extract the core message
      let message = cleaned.substring(messageStart, messageEnd);
      
      // Step 5: Clean up the extracted message
      message = message.replace(/^\s*Your update from [^.\n]+\.?\s*/i, ''); // Remove header if still there
      message = message.replace(/^\s*Your application to [^.\n]+\.?\s*/i, ''); // Remove application header too
      message = message.replace(/\s+/g, ' '); // Normalize spaces
      message = message.replace(/^\s*--\s*/gm, ''); // Remove dashes
      message = message.replace(/<[^>]*>/g, ' '); // Remove any HTML tags
      message = message.trim();
      
      this.logWithFile(`🔍 EXTRACT: Final message length: ${message.length}`);
      this.logWithFile(`🔍 EXTRACT: Final message preview: ${message.substring(0, 200)}`);
      
      // Return the extracted message if it's reasonable, otherwise return original
      if (message.length > 20) {
        this.logWithFile(`🔍 EXTRACT: Successfully extracted clean rejection message`);
        return message;
      } else {
        this.logWithFile(`🔍 EXTRACT: Extraction too short, returning original content`);
        return content;
      }
      
    } catch (error) {
      this.logWithFile(`🔍 EXTRACT: Error extracting rejection message: ${error.message}`);
      return content; // Fallback to original
    }
  }

  /**
   * Decode quoted-printable content
   */
  decodeQuotedPrintable(input) {
    if (!input) return '';
    
    // Replace =XX with the corresponding character
    let decoded = input.replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    // Handle soft line breaks (= at end of line)
    decoded = decoded.replace(/=\r?\n/g, '');
    
    // Handle remaining = characters
    decoded = decoded.replace(/=$/gm, '');
    
    return decoded;
  }

  /**
   * Fetch email in RAW format and extract content
   */
  async extractFromRawFormat(messageId) {
    try {
      // We need access to the Gmail API client - get it from the Gmail auth
      const accounts = this.gmailAuth.getAllAccounts();
      if (!accounts || accounts.length === 0) {
        throw new Error('No Gmail accounts available');
      }
      
      // Use the first account's OAuth client
      const account = accounts[0];
      const oauth2Client = this.gmailAuth.getOAuthClient(account.email);
      
      // Import gmail from googleapis
      const { google } = require('googleapis');
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      this.logWithFile(`🔍 RAW FALLBACK: Fetching RAW format for message ${messageId}`);
      
      // Fetch the message in RAW format
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'raw'
      });
      
      const rawData = response.data.raw;
      if (!rawData) {
        throw new Error('No RAW data returned from Gmail API');
      }
      
      // Decode the base64url RAW data
      const rawEmail = Buffer.from(rawData, 'base64url').toString('utf-8');
      
      this.logWithFile(`🔍 RAW FALLBACK: Got RAW email, length: ${rawEmail.length}`);
      this.logWithFile(`🔍 RAW FALLBACK: RAW preview: ${rawEmail.substring(0, 300)}`);
      
      // Enhanced MIME parsing for RAW format
      const extractedContent = this.parseRawMimeContent(rawEmail);
      
      if (extractedContent && extractedContent.body && extractedContent.body.length > 100) {
        this.logWithFile(`🔍 RAW FALLBACK: Successfully extracted content, length: ${extractedContent.body.length}`);
        this.logWithFile(`🔍 RAW FALLBACK: Extracted content preview: ${extractedContent.body.substring(0, 300)}`);
        return extractedContent;
      }
      
      // Fallback: Simple RFC822 parsing - look for the body after headers
      const emailParts = rawEmail.split('\r\n\r\n');
      if (emailParts.length < 2) {
        // Try with just \n\n separator
        const altParts = rawEmail.split('\n\n');
        if (altParts.length >= 2) {
          const bodyPart = altParts.slice(1).join('\n\n');
          return { body: bodyPart.trim(), isHtml: bodyPart.includes('<html') };
        }
        throw new Error('Could not separate headers from body in RAW email');
      }
      
      // Get body part (everything after first double newline)
      const bodyPart = emailParts.slice(1).join('\r\n\r\n');
      const isHtml = bodyPart.toLowerCase().includes('<html') || bodyPart.toLowerCase().includes('content-type: text/html');
      
      this.logWithFile(`🔍 RAW FALLBACK: Extracted body length: ${bodyPart.length}, isHtml: ${isHtml}`);
      
      return {
        body: bodyPart.trim(),
        isHtml
      };
      
    } catch (error) {
      this.logWithFile(`🔍 RAW FALLBACK: Error in extractFromRawFormat: ${error.message}`);
      throw error;
    }
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
            this.extractCleanPlaintext(email),  // 6. plaintext (clean text)
            email.bodyIsHtml ? email.body : null,  // 7. body_html (original HTML)
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
   * Filter out emails that are already processed
   */
  filterAlreadyProcessed(emails, account) {
    const db = this.db;
    
    // Get all existing gmail_message_ids for this account
    const existingIds = db.prepare(`
      SELECT gmail_message_id 
      FROM email_pipeline 
      WHERE account_email = ?
    `).all(account.email).map(row => row.gmail_message_id);
    
    const existingIdsSet = new Set(existingIds);
    
    // Filter out emails that already exist in the database
    const newEmails = [];
    const skippedEmails = [];
    
    emails.forEach(email => {
      if (existingIdsSet.has(email.id)) {
        skippedEmails.push(email);
      } else {
        newEmails.push(email);
      }
    });
    
    const skippedCount = skippedEmails.length;
    
    // Debug logging for skipped emails
    this.logWithFile(`🔍 DEBUG: Duplicate filtering - ${newEmails.length} new emails, ${skippedCount} already processed`);
    
    // Log LinkedIn/Finezi emails that are being skipped as duplicates
    const skippedLinkedIn = skippedEmails.filter(email => 
      email.from?.toLowerCase().includes('linkedin') || 
      email.subject?.toLowerCase().includes('finezi') ||
      email.from?.toLowerCase().includes('finezi')
    );
    
    if (skippedLinkedIn.length > 0) {
      this.logWithFile(`⚠️ WARNING: ${skippedLinkedIn.length} LinkedIn/Finezi emails skipped as duplicates:`);
      skippedLinkedIn.forEach(email => {
        const emailInfo = {
          subject: email.subject?.substring(0, 60),
          from: email.from?.substring(0, 50),
          date: email.date,
          id: email.id
        };
        this.logWithFile(`📧 SKIPPED LinkedIn/Finezi: ${JSON.stringify(emailInfo)}`);
      });
    }
    
    return {
      newEmails,
      skippedCount
    };
  }

  /**
   * Convert HTML content to clean plain text with improved LinkedIn email handling
   */
  stripHtmlTags(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Debug logging for LinkedIn emails
    const isLinkedInEmail = html.includes('This email was intended for') || 
                           html.includes('linkedin.com') ||
                           html.toLowerCase().includes('finezi');
    
    if (isLinkedInEmail) {
      this.logWithFile(`🔍 HTML STRIP DEBUG - Input length: ${html.length}`);
      this.logWithFile(`🔍 HTML STRIP DEBUG - First 300 chars: ${html.substring(0, 300)}`);
    }

    let text = html
      // Remove script and style tags and their content
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      
      // LinkedIn specific: Try to extract main content before footer sections
      // Remove LinkedIn tracking pixels and hidden content
      .replace(/<img[^>]*?1px[^>]*?>/gi, '')
      .replace(/<div[^>]*?style="[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      
      // LinkedIn: Remove footer sections that contain unsubscribe/help links
      .replace(/<div[^>]*?class="[^"]*footer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<table[^>]*?class="[^"]*footer[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
      
      // LinkedIn: Try to preserve main content sections
      .replace(/<div[^>]*?class="[^"]*content[^"]*"[^>]*>/gi, '\n')
      .replace(/<div[^>]*?class="[^"]*message[^"]*"[^>]*>/gi, '\n')
      
      // Convert common block elements to line breaks
      .replace(/<\/(div|p|br|h[1-6]|li|tr|td)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|h[1-6]|li|ul|ol)[^>]*>/gi, '\n')
      
      // Convert list items to bullet points
      .replace(/<li[^>]*>/gi, '• ')
      
      // Remove all remaining HTML tags
      .replace(/<[^>]+>/g, ' ')
      
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&zwnj;/g, '')  // LinkedIn uses zero-width non-joiner
      
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // LinkedIn specific: If the text is mostly footer/unsubscribe content, 
    // try to find the actual message content
    if (text.includes('This email was intended for') && text.includes('Unsubscribe')) {
      // Try to extract content between header and footer
      const lines = text.split('\n');
      const mainContent = [];
      let inMainSection = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) continue;
        
        // Skip LinkedIn footer indicators
        if (trimmedLine.includes('This email was intended for') ||
            trimmedLine.includes('Learn why we included this') ||
            trimmedLine.includes('You are receiving LinkedIn') ||
            trimmedLine.includes('Unsubscribe:') ||
            trimmedLine.includes('Help:') ||
            trimmedLine.includes('LinkedIn Corporation') ||
            trimmedLine.startsWith('http') && trimmedLine.includes('linkedin.com')) {
          continue;
        }
        
        // Look for actual content
        if (trimmedLine.length > 10 && !trimmedLine.match(/^[a-zA-Z0-9\-_]+$/)) {
          mainContent.push(trimmedLine);
        }
      }
      
      if (mainContent.length > 0) {
        return mainContent.join('\n\n');
      }
    }

    // Debug logging for LinkedIn emails - show final result
    if (isLinkedInEmail) {
      this.logWithFile(`🔍 HTML STRIP DEBUG - Final output length: ${text.length}`);
      this.logWithFile(`🔍 HTML STRIP DEBUG - Final output: ${text.substring(0, 500)}`);
    }

    return text;
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
