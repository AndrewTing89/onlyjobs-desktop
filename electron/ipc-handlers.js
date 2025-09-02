const { ipcMain, dialog, shell, Notification, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');
const Store = require('electron-store').default || require('electron-store');
const { app } = require('electron');
const { spawn } = require('child_process');
const { convert } = require('html-to-text');
const { getClassifierProvider } = require('./classifier');
const classifier = getClassifierProvider();
const { PromptManager } = require('./llm/promptManager');
const promptManager = new PromptManager();
const DatabaseInitializer = require('./database/db-init');
const { addHumanInLoopTables } = require('./database/migrations/add_human_in_loop_tables');

// Store for saving custom prompt
const promptStore = new Store({ name: 'prompt-settings' });

// Removed old auth-flow - using simplified auth for desktop app
// const GmailAuth = require('./gmail-auth'); // Removed - using multi-account only
const GmailMultiAuth = require('./gmail-multi-auth');
const IntegratedEmailProcessor = require('./integrated-email-processor');
// ML classifier removed - using pure LLM approach

console.log('Loading IPC handlers...');

// ML classifier removed - using pure LLM approach

// Pure LLM approach - no ML initialization needed

// Initialize secure storage - defer until needed
let store = null;
function getStore() {
  if (!store) {
    store = new Store({
      encryptionKey: 'onlyjobs-desktop-2024' // In production, use a more secure key
    });
  }
  return store;
}

// Initialize database - defer until needed
let db = null;
let initialized = false;
let dbInitializer = null;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    db = new Database(dbPath);
    
    if (!initialized) {
      try {
        // Use the new database initializer
        dbInitializer = new DatabaseInitializer(dbPath);
        
        // Initialize the complete schema
        const initResult = dbInitializer.initializeDatabase();
        if (!initResult.success) {
          console.error('Database initialization failed:', initResult.error);
        }
        
        // Run all migrations
        const migrationResult = dbInitializer.runMigrations();
        if (!migrationResult.success) {
          console.error('Database migration failed:', migrationResult.error);
        }
        
        // Run human-in-the-loop migration specifically
        try {
          const humanInLoopResult = addHumanInLoopTables();
          if (!humanInLoopResult.success) {
            console.error('Human-in-the-loop migration failed:', humanInLoopResult.error);
          }
        } catch (migrationError) {
          console.error('Human-in-the-loop migration error:', migrationError);
        }
        
        // Add email pipeline tables migration
        try {
          const { addEmailPipelineTables, migrateExistingData } = require('./database/migrations/add_email_pipeline');
          addEmailPipelineTables(db);
          
          // Check if pipeline is empty and needs migration
          const pipelineCount = db.prepare('SELECT COUNT(*) as count FROM email_pipeline').get();
          if (pipelineCount.count === 0) {
            console.log('Migrating existing data to email_pipeline...');
            migrateExistingData(db);
          }
        } catch (pipelineError) {
          console.error('Email pipeline migration error:', pipelineError);
        }
        
        initialized = true;
        console.log('Database initialization and migrations completed successfully');
        
      } catch (error) {
        console.error('Error during database initialization:', error);
        // Fall back to legacy initialization
        initializeDatabase();
        initialized = true;
      }
    }
  }
  return db;
}

// Initialize database schema
function initializeDatabase() {
  // Disable foreign keys during migration
  getDb().pragma('foreign_keys = OFF');
  
  // First ensure the jobs table has all required columns
  try {
    const jobsTableInfo = getDb().prepare("PRAGMA table_info(jobs)").all();
    const hasAccountEmail = jobsTableInfo.some(col => col.name === 'account_email');
    
    if (!hasAccountEmail && jobsTableInfo.length > 0) {
      console.log('Adding missing account_email column to jobs table...');
      getDb().exec('ALTER TABLE jobs ADD COLUMN account_email TEXT');
      getDb().exec('ALTER TABLE jobs ADD COLUMN from_address TEXT');
    }
  } catch (e) {
    console.log('Database migration check:', e.message);
  }
  
  try {
    // First, check if jobs table exists and needs migration
    const jobsTableExists = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get();
    
    if (jobsTableExists) {
      // Check if jobs table needs migration to new schema
      const jobsTableInfo = getDb().prepare("PRAGMA table_info(jobs)").all();
      const hasGmailMessageId = jobsTableInfo.some(col => col.name === 'gmail_message_id');
      const hasAccountEmail = jobsTableInfo.some(col => col.name === 'account_email');
      const hasFromAddress = jobsTableInfo.some(col => col.name === 'from_address');
      
      if (!hasGmailMessageId || !hasAccountEmail || !hasFromAddress) {
        console.log('Migrating jobs table to new schema...');
        
        // Create new jobs table with correct schema
        getDb().exec(`
          CREATE TABLE IF NOT EXISTS jobs_new (
            id TEXT PRIMARY KEY,
            gmail_message_id TEXT,
            company TEXT NOT NULL,
            position TEXT NOT NULL,
            status TEXT DEFAULT 'Applied' CHECK(status IN ('Applied', 'Interviewed', 'Declined', 'Offer')),
            applied_date DATE,
            location TEXT,
            salary_range TEXT,
            notes TEXT,
            ml_confidence REAL,
            account_email TEXT,
            from_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        // Copy only essential data from old table
        getDb().exec(`
          INSERT INTO jobs_new (id, company, position, status, applied_date, location, salary_range, notes, ml_confidence, created_at, updated_at, gmail_message_id, account_email, from_address)
          SELECT 
            id,
            company,
            position,
            CASE 
              WHEN status = 'active' THEN 'Applied'
              WHEN status = 'applied' THEN 'Applied'
              WHEN status = 'interviewing' THEN 'Interviewed'
              WHEN status = 'offered' THEN 'Offer'
              WHEN status = 'rejected' THEN 'Declined'
              WHEN status = 'withdrawn' THEN 'Declined'
              ELSE 'Applied'
            END as status,
            COALESCE(applied_date, date('now')) as applied_date,
            location,
            salary_range,
            notes,
            ml_confidence,
            COALESCE(created_at, datetime('now')) as created_at,
            COALESCE(updated_at, datetime('now')) as updated_at,
            'migrated_' || id as gmail_message_id,
            'unknown' as account_email,
            'migrated' as from_address
          FROM jobs;
        `);
        
        // Drop old table and rename new one
        getDb().exec('DROP TABLE jobs');
        getDb().exec('ALTER TABLE jobs_new RENAME TO jobs');
        
        console.log('Migration completed: Updated jobs table schema');
      }
    }
    
    // Drop old emails table if it exists
    const stmt = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'");
    const oldEmailsTable = stmt.get();
    
    if (oldEmailsTable) {
      console.log('Removing old emails table...');
      getDb().exec('DROP TABLE IF EXISTS emails');
      console.log('Migration completed: Removed old emails table');
    }
    
  } catch (error) {
    console.error('Migration error:', error);
  }
  
  // Add missing columns to email_sync table if they don't exist
  try {
    const emailSyncColumns = getDb().pragma('table_info(email_sync)');
    const hasAccountEmail = emailSyncColumns.some(col => col.name === 'account_email');
    
    if (!hasAccountEmail) {
      console.log('Adding account_email column to email_sync table...');
      getDb().exec(`
        ALTER TABLE email_sync 
        ADD COLUMN account_email TEXT DEFAULT 'unknown@gmail.com'
      `);
      console.log('Added account_email column to email_sync table');
    }
  } catch (error) {
    console.log('email_sync table migration:', error.message);
  }
  
  getDb().exec(`
    -- Gmail accounts table for multi-account support
    CREATE TABLE IF NOT EXISTS gmail_accounts (
      id TEXT,
      email TEXT PRIMARY KEY,
      display_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry TIMESTAMP,
      sync_enabled BOOLEAN DEFAULT 1,
      is_active BOOLEAN DEFAULT 1,
      last_sync TIMESTAMP,
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );


    -- Jobs table (refined)
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT NOT NULL,
      company TEXT NOT NULL,
      position TEXT NOT NULL,
      status TEXT DEFAULT 'Applied' CHECK(status IN ('Applied', 'Interviewed', 'Declined', 'Offer')),
      applied_date DATE,
      location TEXT,
      salary_range TEXT,
      notes TEXT,
      ml_confidence REAL,
      account_email TEXT,
      from_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(gmail_message_id, account_email)
    );

    -- Email sync tracking table
    CREATE TABLE IF NOT EXISTS email_sync (
      gmail_message_id TEXT,
      account_email TEXT NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_job_related BOOLEAN DEFAULT 0,
      PRIMARY KEY (gmail_message_id, account_email)
    );

    -- Sync status
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_fetch_time TIMESTAMP,
      last_classify_time TIMESTAMP,
      last_sync_status TEXT,
      total_emails_fetched INTEGER DEFAULT 0,
      total_emails_classified INTEGER DEFAULT 0,
      total_jobs_found INTEGER DEFAULT 0
    );
    
    -- Sync history log table
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      accounts_synced INTEGER,
      emails_fetched INTEGER,
      emails_processed INTEGER,
      emails_classified INTEGER,
      jobs_found INTEGER,
      new_jobs INTEGER,
      updated_jobs INTEGER,
      duration_ms INTEGER,
      status TEXT,
      error_message TEXT
    );

    -- Email review table for uncertain classifications
    CREATE TABLE IF NOT EXISTS email_review (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT NOT NULL,
      account_email TEXT NOT NULL,
      subject TEXT,
      from_email TEXT,
      body_text TEXT,
      received_date DATETIME,
      
      -- Classification results
      is_job_related BOOLEAN,
      company TEXT,
      position TEXT,
      status TEXT,
      confidence_score REAL,
      classification_model TEXT,
      classification_reason TEXT,
      
      -- Review status
      manually_reviewed BOOLEAN DEFAULT 0,
      confirmed_classification BOOLEAN,
      review_notes TEXT,
      
      -- Auto-deletion
      retention_days INTEGER DEFAULT 7,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(gmail_message_id, account_email)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_gmail_id ON jobs(gmail_message_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_email);

    CREATE INDEX IF NOT EXISTS idx_email_sync_account ON email_sync(account_email);
    CREATE INDEX IF NOT EXISTS idx_review_expires ON email_review(expires_at);
    CREATE INDEX IF NOT EXISTS idx_review_confidence ON email_review(confidence_score);
    CREATE INDEX IF NOT EXISTS idx_review_reviewed ON email_review(manually_reviewed);

    -- Initialize sync status if not exists
    INSERT OR IGNORE INTO sync_status (id) VALUES (1);
  `);
  
  // Re-enable foreign keys
  getDb().pragma('foreign_keys = ON');
  
  // Add confidence_score to jobs table if it doesn't exist
  try {
    const jobsTableInfo = getDb().prepare("PRAGMA table_info(jobs)").all();
    const hasConfidenceScore = jobsTableInfo.some(col => col.name === 'confidence_score');
    
    if (!hasConfidenceScore && jobsTableInfo.length > 0) {
      console.log('Adding confidence_score column to jobs table...');
      getDb().exec('ALTER TABLE jobs ADD COLUMN confidence_score REAL DEFAULT 0.8');
      getDb().exec('ALTER TABLE jobs ADD COLUMN classification_model TEXT');
    }
  } catch (e) {
    console.log('Confidence score columns may already exist:', e.message);
  }
}

// Helper function to calculate retention days based on confidence
function calculateRetentionDays(confidence, preClassification) {
  // Don't store obvious non-job emails
  if (preClassification === 'not_job' && confidence > 0.8) return 0;
  
  // Longer retention for uncertain classifications
  if (confidence < 0.5) return 30;  // Very uncertain - keep for 30 days
  if (confidence < 0.7) return 14;  // Moderately uncertain - keep for 14 days
  return 7;  // High confidence but still worth review - keep for 7 days
}

// Helper function to store email for review
async function storeEmailForReview(email, classification, confidence, retentionDays, accountEmail) {
  if (retentionDays === 0) return; // Don't store if retention is 0
  
  const db = getDb();
  const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  
  const headers = email.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from = headers.find(h => h.name === 'From')?.value || '';
  const date = headers.find(h => h.name === 'Date')?.value || '';
  const emailContent = _extractEmailContent(email);
  
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO email_review (
        id, gmail_message_id, account_email, subject, from_email, body_text,
        received_date, is_job_related, company, position, status,
        confidence_score, classification_model, retention_days, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      reviewId,
      email.id,
      accountEmail,
      subject,
      from,
      emailContent,
      date,
      classification.is_job_related ? 1 : 0,
      classification.company,
      classification.position,
      classification.status,
      confidence,
      'default-llm', // You can update this based on actual model used
      retentionDays,
      expiresAt.toISOString()
    );
    
    // console.log(`📋 Stored email for review: ${subject.substring(0, 50)} (confidence: ${confidence.toFixed(2)}, retention: ${retentionDays} days)`);
  } catch (error) {
    console.error('Error storing email for review:', error);
  }
}

// Cleanup job for expired reviews - runs on app startup and periodically
async function cleanupExpiredReviews() {
  try {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM email_review 
      WHERE expires_at < datetime('now')
        AND manually_reviewed = 0
    `).run();
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} expired review emails`);
    }
    
    return result.changes;
  } catch (error) {
    console.error('Error cleaning up expired reviews:', error);
    return 0;
  }
}

// Run cleanup on startup
setTimeout(() => {
  cleanupExpiredReviews();
}, 5000); // Run 5 seconds after startup

// Run cleanup periodically (every 24 hours)
setInterval(() => {
  cleanupExpiredReviews();
}, 24 * 60 * 60 * 1000);

// Database operations
ipcMain.handle('db:get-jobs', async (event, filters = {}) => {
  try {
    let query = `
      SELECT * 
      FROM jobs
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.company) {
      query += ' AND company LIKE ?';
      params.push(`%${filters.company}%`);
    }

    if (filters.startDate) {
      query += ' AND applied_date >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND applied_date <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY applied_date DESC, created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = getDb().prepare(query);
    const results = stmt.all(...params);
    
    console.log(`Found ${results.length} jobs`);
    console.log('Sample job from database:', results[0]); // Debug first job
    
    return results;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
});


ipcMain.handle('db:get-job', async (event, id) => {
  try {
    const stmt = getDb().prepare(`
      SELECT * 
      FROM jobs
      WHERE id = ?
    `);
    const result = stmt.get(id);
    
    console.log(`Fetched job ${id}:`, result);
    
    return result;
  } catch (error) {
    console.error('Error fetching job:', error);
    throw error;
  }
});

ipcMain.handle('db:get-job-email', async (event, jobId) => {
  try {
    const stmt = getDb().prepare(`
      SELECT email_content, email_history
      FROM jobs
      WHERE id = ?
    `);
    const result = stmt.get(jobId);
    
    if (!result) {
      return { success: false, error: 'Job not found' };
    }
    
    // Parse email_history if it's a JSON string
    let emailHistory = [];
    if (result.email_history) {
      try {
        emailHistory = JSON.parse(result.email_history);
      } catch (e) {
        console.error('Error parsing email history:', e);
      }
    }
    
    return {
      success: true,
      emailContent: result.email_content || '',
      emailHistory: emailHistory
    };
  } catch (error) {
    console.error('Error fetching job email:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:create-job', async (event, job) => {
  try {
    const id = job.id || `job_${Date.now()}_${performance.now().toString().replace('.', '_')}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO jobs (id, gmail_message_id, company, position, status, applied_date, location, salary_range, notes, ml_confidence, account_email, from_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      id,
      job.gmail_message_id,
      job.company,
      job.position,
      job.status || 'Applied',
      job.applied_date || new Date().toISOString().split('T')[0],
      job.location,
      job.salary_range,
      job.notes,
      job.ml_confidence,
      job.account_email,
      job.from_address
    );

    return { id, ...job, changes: result.changes };
  } catch (error) {
    console.error('Error creating job:', error);
    throw error;
  }
});

ipcMain.handle('db:update-job', async (event, id, updates) => {
  try {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    const stmt = getDb().prepare(`
      UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    return { changes: result.changes };
  } catch (error) {
    console.error('Error updating job:', error);
    throw error;
  }
});

ipcMain.handle('db:delete-job', async (event, id) => {
  try {
    const stmt = getDb().prepare('DELETE FROM jobs WHERE id = ?');
    const result = stmt.run(id);
    return { changes: result.changes };
  } catch (error) {
    console.error('Error deleting job:', error);
    throw error;
  }
});

// Email Review Management Handlers
ipcMain.handle('review:get-pending', async (event, filters = {}) => {
  try {
    const { limit = 50, confidence_max = 1.0, reviewed = false } = filters;
    
    let query = `
      SELECT * FROM email_review 
      WHERE manually_reviewed = ?
        AND confidence_score <= ?
        AND expires_at > datetime('now')
      ORDER BY confidence_score ASC, created_at DESC
      LIMIT ?
    `;
    
    const stmt = getDb().prepare(query);
    const reviews = stmt.all(reviewed ? 1 : 0, confidence_max, limit);
    
    return {
      success: true,
      reviews,
      total: getDb().prepare('SELECT COUNT(*) as count FROM email_review WHERE manually_reviewed = 0').get().count
    };
  } catch (error) {
    console.error('Error getting pending reviews:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('review:mark-job-related', async (event, reviewId) => {
  try {
    const db = getDb();
    
    // Get the review email
    const review = db.prepare('SELECT * FROM email_review WHERE id = ?').get(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }
    
    // Create job entry
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const jobStmt = db.prepare(`
      INSERT INTO jobs (
        id, gmail_message_id, company, position, status, 
        applied_date, account_email, from_address, notes,
        confidence_score, classification_model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    jobStmt.run(
      jobId,
      review.gmail_message_id,
      review.company || 'Unknown',
      review.position || 'Unknown Position',
      review.status || 'Applied',
      review.received_date,
      review.account_email,
      review.from_email,
      'Manually marked as job-related from review queue',
      1.0, // Full confidence since manually confirmed
      'manual_review'
    );
    
    // Update email_sync table
    db.prepare(`
      UPDATE email_sync 
      SET is_job_related = 1 
      WHERE gmail_message_id = ? AND account_email = ?
    `).run(review.gmail_message_id, review.account_email);
    
    // Delete from review table
    db.prepare('DELETE FROM email_review WHERE id = ?').run(reviewId);
    
    return { success: true, jobId };
  } catch (error) {
    console.error('Error marking as job-related:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('review:confirm-not-job', async (event, reviewId) => {
  try {
    // Simply delete from review table (already marked as not job in email_sync)
    const stmt = getDb().prepare('DELETE FROM email_review WHERE id = ?');
    const result = stmt.run(reviewId);
    
    return { success: true, deleted: result.changes > 0 };
  } catch (error) {
    console.error('Error confirming not-job:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('review:get-stats', async () => {
  try {
    const db = getDb();
    
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM email_review').get().count,
      pending: db.prepare('SELECT COUNT(*) as count FROM email_review WHERE manually_reviewed = 0').get().count,
      reviewed: db.prepare('SELECT COUNT(*) as count FROM email_review WHERE manually_reviewed = 1').get().count,
      expiringSoon: db.prepare(`
        SELECT COUNT(*) as count FROM email_review 
        WHERE expires_at < datetime('now', '+2 days')
          AND manually_reviewed = 0
      `).get().count,
      byConfidence: db.prepare(`
        SELECT 
          CASE 
            WHEN confidence_score < 0.5 THEN 'very_low'
            WHEN confidence_score < 0.6 THEN 'low'
            WHEN confidence_score < 0.7 THEN 'medium'
            ELSE 'high'
          END as level,
          COUNT(*) as count
        FROM email_review
        WHERE manually_reviewed = 0
        GROUP BY level
      `).all()
    };
    
    return { success: true, stats };
  } catch (error) {
    console.error('Error getting review stats:', error);
    return { success: false, error: error.message };
  }
});

// Email classification using ML model
ipcMain.handle('classify-email', async (event, arg) => {
  try {
    console.log('📧 Classifying email...');
    
    // Accept either string (legacy) or object { subject, plaintext }
    const input = typeof arg === 'string'
      ? { subject: '', plaintext: arg }
      : { subject: arg?.subject || '', plaintext: arg?.plaintext || '' };
    
    console.log(`📧 Input: subject="${input.subject}", plaintext length=${input.plaintext.length}`);
    
    // Use the provider-based classifier
    const classifier = getClassifierProvider();
    const result = await classifier.parse(input);
    
    // Enhance result with additional job extraction logic (preserve existing behavior)
    const enhancedResult = {
      ...result,
      job_type: _extractJobType(input.plaintext, result.is_job_related),
      company: result.company || _extractCompany(input.plaintext),
      position: result.position || _extractPosition(input.plaintext)
    };
    
    console.log('✅ Email classification result:', {
      is_job_related: enhancedResult.is_job_related,
      confidence: enhancedResult.confidence,
      job_type: enhancedResult.job_type
    });
    
    return enhancedResult;
  } catch (error) {
    console.error('❌ Error classifying email:', error);
    throw error;
  }
});

// Helper function to extract job type from email content
function _extractJobType(content, isJobRelated) {
  if (!isJobRelated) return null;
  
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('interview') || lowerContent.includes('schedule') || lowerContent.includes('meet')) {
    return 'interview';
  } else if (lowerContent.includes('offer') || lowerContent.includes('congratulations')) {
    return 'offer';
  } else if (lowerContent.includes('reject') || lowerContent.includes('unfortunately') || lowerContent.includes('not selected')) {
    return 'rejection';
  } else if (lowerContent.includes('follow up') || lowerContent.includes('checking in')) {
    return 'follow_up';
  } else {
    return 'application_sent';
  }
}

// Helper function to extract company name from email content
function _extractCompany(content) {
  // First clean HTML tags if present
  const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  // Try to extract from common email patterns
  const patterns = [
    // Company name before "is hiring/looking for"
    /(?:^|\n)([A-Z][A-Za-z0-9\s&\.\-]+?)(?:\s+is\s+(?:hiring|looking for|seeking))/mi,
    // Company name after "at/with"
    /(?:position|role|opportunity|job|work)\s+(?:at|with)\s+([A-Z][A-Za-z0-9\s&\.\-]+?)(?:\s*[,\.\n]|$)/mi,
    // Company name in "Join X" pattern
    /Join\s+([A-Z][A-Za-z0-9\s&\.\-]+?)(?:\s+as|\s+team|\s*[,\.\n])/mi,
    // From X Team/HR/Recruiting
    /(?:from|regards,?)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&\.\-]+?)\s+(?:team|hr|recruiting|talent|hiring)/mi,
    // X Inc/LLC/Corp/Ltd
    /([A-Z][A-Za-z0-9\s&\.\-]+?)\s+(?:inc\.?|llc|corp(?:oration)?\.?|ltd\.?|limited|co\.?|company)(?:\s|$)/mi,
    // Thanks for applying to Company pattern
    /Thanks for applying to\s+([A-Z][A-Za-z0-9\s&\.\-]+?)\s+for/mi,
    // From email address pattern
    /From:.*?@([a-zA-Z0-9\-]+)\.(?:com|org|net|io)/mi
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match && match[1]) {
      let company = match[1].trim();
      // Clean up the company name
      company = company.replace(/\s+/g, ' ').trim();
      // Filter out common false positives
      if (company.length > 2 && 
          !['The', 'This', 'Our', 'Your', 'New', 'Best', 'Great'].includes(company)) {
        return company;
      }
    }
  }
  
  // Try to extract from email subject if it's in the content
  const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
  if (subjectMatch) {
    const subject = subjectMatch[1];
    // Look for company in brackets or after "at"
    const companyInSubject = subject.match(/\[([^\]]+)\]|at\s+([A-Z][A-Za-z0-9\s&\.\-]+?)(?:\s*[-–]|\s*$)/i);
    if (companyInSubject) {
      const company = (companyInSubject[1] || companyInSubject[2]).trim();
      if (company.length > 2) return company;
    }
  }
  
  return 'Unknown Company';
}

// Helper function to extract position from email content
function _extractPosition(content) {
  // First clean HTML tags if present
  const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  // Common job title patterns
  const patterns = [
    // "Software Engineer position/role/job"
    /([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))\s+(?:position|role|job|opening)/i,
    // "position/role as Software Engineer"
    /(?:position|role|opportunity|job|opening)\s+(?:as|for|of)\s+(?:a\s+)?([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))/i,
    // "hiring (a) Software Engineer"
    /(?:hiring|seeking|looking for)\s+(?:a\s+)?([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))/i,
    // "Software Engineer at/with Company"
    /([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))\s+(?:at|with)/i,
    // Common titles in subject line format
    /Subject:.*?(?:\[|\()?([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))(?:\]|\))?/i,
    // Remote position pattern from HTML
    /remote position of\s+([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Scientist|Specialist|Consultant|Director|Lead|Architect|Administrator))/i,
    // Specific common titles
    /\b(Software Engineer|Frontend Developer|Backend Developer|Full Stack Developer|Data Scientist|Product Manager|Project Manager|UX Designer|UI Designer|DevOps Engineer|QA Engineer|Sales Manager|Marketing Manager|Business Analyst|Data Analyst|Research Scientist|Machine Learning Engineer|AI Engineer|Cloud Engineer|Security Engineer|Platform Engineer|Site Reliability Engineer|Solutions Architect|Technical Lead|Engineering Manager|Product Designer|Content Manager|Operations Manager|Account Manager|Customer Success Manager)\b/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern) || cleanContent.match(pattern);
    if (match && match[1]) {
      let position = match[1].trim();
      // Clean up the position
      position = position.replace(/\s+/g, ' ').trim();
      // Make sure it's a reasonable length
      if (position.length > 3 && position.length < 50) {
        // Capitalize properly
        return position.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }
  
  // Try to extract from subject line
  const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
  if (subjectMatch) {
    const subject = subjectMatch[1];
    // Look for position indicators
    const positionMatch = subject.match(/(?:^|[-–\s])([A-Za-z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Intern|Scientist))(?:[-–\s]|$)/i);
    if (positionMatch) {
      const position = positionMatch[1].trim();
      if (position.length > 3) {
        return position.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }
  
  return 'Unknown Position';
}

// ML Model management
// LLM Health Check - Updated for multi-model system
ipcMain.handle('llm:health-check', async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const modelManager = require('./model-manager');
    
    // Check the default model
    const defaultModelId = 'llama-3-8b-instruct-q5_k_m';
    const modelPath = path.join('/Users/ndting/Library/Application Support/models', `${defaultModelId}.gguf`);
    
    const health = {
      status: 'unknown',
      modelPath: modelPath,
      modelExists: false,
      modelSize: 0,
      expectedSize: 0, // Will be set from model manager
      canLoad: false,
      error: null,
      lastChecked: new Date().toISOString()
    };
    
    // Get model info
    const models = modelManager.getAllModels();
    const defaultModel = models.find(m => m.id === defaultModelId);
    
    if (defaultModel) {
      health.expectedSize = defaultModel.size;
      
      // Check if model file exists
      if (fs.existsSync(modelPath)) {
        health.modelExists = true;
        const stats = fs.statSync(modelPath);
        health.modelSize = stats.size;
        
        // Check file size
        if (Math.abs(health.modelSize - health.expectedSize) < 1000) {
          health.status = 'healthy';
          health.canLoad = true;
        } else {
          health.status = 'unhealthy';
          health.error = `Model file size mismatch. Expected ~${health.expectedSize} bytes, got ${health.modelSize} bytes`;
        }
      } else {
        health.status = 'unhealthy';
        health.error = 'Model file not found. Please download the model first.';
      }
    } else {
      health.status = 'error';
      health.error = 'Default model not found in model registry';
    }
    
    return health;
  } catch (error) {
    console.error('Health check error:', error);
    return {
      status: 'error',
      error: error.message,
      modelExists: false,
      canLoad: false,
      lastChecked: new Date().toISOString()
    };
  }
});

ipcMain.handle('ml:get-status', async () => {
  try {
    // ML model status is now handled by LLM models
    return { 
      status: 'Using local LLM model',
      model_ready: true 
    };
  } catch (error) {
    console.error('Error getting ML model status:', error);
    throw error;
  }
});

ipcMain.handle('ml:is-ready', async () => {
  try {
    // LLM models are checked separately
    return { ready: true };
  } catch (error) {
    console.error('Error checking ML model readiness:', error);
    return { ready: false, error: error.message };
  }
});

ipcMain.handle('ml:train-model', async (event, options = {}) => {
  // Training not available for LLM models
  console.log('🏋️  Training not available for LLM models');
  throw new Error('Training not available for LLM models');
});

ipcMain.handle('ml:initialize', async () => {
  try {
    console.log('🧠 LLM models initialized');
    return { success: true };
  } catch (error) {
    console.error('Error initializing LLM models:', error);
    return { success: false, error: error.message };
  }
});

// Training Data Collection Handlers removed - will export classified data directly instead

// ML handlers removed - using pure LLM approach with training data collection

// ML feedback handler removed - using pure LLM approach with training data collection

// Simple mock auth for desktop app (no real authentication needed)
const mockUser = {
  email: 'user@onlyjobs.desktop',
  name: 'OnlyJobs User',
  picture: null
};

// Initialize multi-account Gmail auth - defer until first use
let gmailMultiAuth = null;
let gmailMultiAuthError = null;

function getGmailMultiAuth() {
  if (gmailMultiAuth) return gmailMultiAuth;
  
  if (gmailMultiAuthError) {
    throw new Error(`Gmail multi-auth previously failed to initialize: ${gmailMultiAuthError}`);
  }
  
  try {
    console.log('Initializing GmailMultiAuth on first use...');
    gmailMultiAuth = new GmailMultiAuth();
    console.log('Gmail multi-auth initialized successfully');
    return gmailMultiAuth;
  } catch (error) {
    console.error('Failed to initialize Gmail multi-auth:', error);
    console.error('Full error details:', error.stack);
    gmailMultiAuthError = error.message;
    throw error;
  }
}

// Removed old auth event listeners - using simplified auth

// Authentication operations (simplified for desktop app)
ipcMain.handle('auth:sign-in', async () => {
  console.log('🔵 IPC: auth:sign-in called - using mock auth for desktop app');
  try {
    // Simply return success with mock user for desktop app
    const result = {
      success: true,
      user: mockUser,
      tokens: { email: mockUser.email }
    };
    console.log('🟢 IPC: Sign in completed, result:', result);
    console.log('🔵 IPC: User data:', result?.user);
    
    // IMPORTANT: Also send the auth-success event to all windows
    // This ensures the renderer gets notified even if the promise resolution doesn't work
    if (result && result.user) {
      const windows = BrowserWindow.getAllWindows();
      console.log(`🔵 IPC: Broadcasting to ${windows.length} windows`);
      windows.forEach(window => {
        console.log(`🔵 IPC: Sending auth-success to window ${window.id}`);
        window.webContents.send('auth-success', result);
      });
    }
    
    // Return the actual auth data so the frontend can update immediately
    const response = { 
      success: true,
      user: result?.user,
      tokens: result?.tokens
    };
    console.log('🟢 IPC: Returning response to renderer:', response);
    return response;
  } catch (error) {
    console.error('🔴 IPC: Sign in error:', error);
    console.error('🔴 IPC: Error details:', {
      message: error?.message,
      stack: error?.stack,
      toString: error?.toString()
    });
    // Return a proper error object
    throw new Error(error?.message || error?.toString() || 'Authentication failed');
  }
});

ipcMain.handle('auth:sign-out', async () => {
  // No-op for desktop app
  return { success: true };
});

ipcMain.handle('auth:get-tokens', async () => {
  // Return mock tokens for desktop app
  return { 
    success: true, 
    tokens: { 
      email: mockUser.email,
      name: mockUser.name,
      picture: mockUser.picture
    }
  };
});

ipcMain.handle('auth:is-authenticated', async () => {
  // Always authenticated for desktop app
  return { success: true, authenticated: true };
});

// Old single-account Gmail handlers - DEPRECATED (use multi-account handlers below)
// These are commented out but kept for reference during migration
/*
ipcMain.handle('gmail:authenticate', async () => {
  // DEPRECATED - use gmail:add-account instead
  throw new Error('gmail:authenticate is deprecated. Use gmail:add-account for multi-account support');
});

ipcMain.handle('gmail:get-auth-status', async () => {
  // DEPRECATED - use gmail:get-accounts instead
  throw new Error('gmail:get-auth-status is deprecated. Use gmail:get-accounts for multi-account support');
});

ipcMain.handle('gmail:fetch-emails', async (event, options = {}) => {
  // DEPRECATED - use gmail:sync-all instead
  throw new Error('gmail:fetch-emails is deprecated. Use gmail:sync-all for multi-account support');
});

ipcMain.handle('gmail:disconnect', async () => {
  // DEPRECATED - use gmail:remove-account instead
  throw new Error('gmail:disconnect is deprecated. Use gmail:remove-account for multi-account support');
});
*/

// Gmail sync functionality is now handled by gmail:sync-all handler below

// Helper function to extract email content
function _extractEmailContent(email) {
  const headers = email.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from = headers.find(h => h.name === 'From')?.value || '';
  
  // Extract body
  let body = '';
  const parts = email.payload?.parts || [];
  
  if (email.payload?.body?.data) {
    body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
  } else {
    // Look for text/plain part
    const textPart = parts.find(p => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    } else {
      // Fall back to HTML and convert to text
      const htmlPart = parts.find(p => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        const html = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
        // Use html-to-text to properly convert HTML to readable text
        body = convert(html, {
          wordwrap: 130,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' }
          ]
        });
      }
    }
  }
  
  // Store the original content but also prepare a readable version
  const originalContent = `From: ${from}\nSubject: ${subject}\n\n${body}`;
  
  // If the body contains HTML, also store a text version
  if (body.includes('<!DOCTYPE html>') || body.includes('<html')) {
    const textBody = convert(body, {
      wordwrap: 130,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' }
      ]
    });
    return `From: ${from}\nSubject: ${subject}\n\n${textBody}`;
  }
  
  return originalContent;
}

// Helper function to extract date from email
function _extractDate(email) {
  console.log('Extracting date from email:', {
    hasPayload: !!email.payload,
    hasHeaders: !!(email.payload?.headers),
    headerCount: email.payload?.headers?.length || 0,
    hasInternalDate: !!email.internalDate,
    internalDate: email.internalDate
  });
  
  const headers = email.payload?.headers || [];
  const dateStr = headers.find(h => h.name === 'Date')?.value;
  
  if (dateStr) {
    try {
      const date = new Date(dateStr);
      // Check if date is valid
      if (!isNaN(date.getTime())) {
        console.log(`Email date extracted: ${dateStr} -> ${date.toISOString()}`);
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      console.error('Error parsing date:', error);
    }
  }
  
  // If no valid date found, use internal date
  if (email.internalDate) {
    try {
      // Gmail internalDate is in milliseconds as a string
      const timestamp = parseInt(email.internalDate);
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        console.log(`Using internal date: ${email.internalDate} (${timestamp}) -> ${date.toISOString()}`);
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      console.error('Error parsing internal date:', error);
    }
  }
  
  console.warn('No valid date found for email, using current date');
  return new Date().toISOString().split('T')[0];
}

ipcMain.handle('gmail:get-sync-status', async () => {
  try {
    const stmt = getDb().prepare('SELECT * FROM sync_status WHERE id = 1');
    return stmt.get();
  } catch (error) {
    console.error('Error getting sync status:', error);
    throw error;
  }
});

// Get sync history
ipcMain.handle('sync:get-history', async (event, limit = 20) => {
  try {
    const history = getDb().prepare(`
      SELECT * FROM sync_history 
      ORDER BY sync_date DESC 
      LIMIT ?
    `).all(limit);
    
    return { success: true, history };
  } catch (error) {
    console.error('Error getting sync history:', error);
    return { success: false, error: error.message };
  }
});

// Settings management
ipcMain.handle('settings:get', async () => {
  try {
    return {
      syncInterval: getStore().get('syncInterval', 30),
      notifications: getStore().get('notifications', true),
      autoStart: getStore().get('autoStart', false),
      theme: getStore().get('theme', 'light'),
      emailFilters: getStore().get('emailFilters', {
        skipDomains: ['amazon.com', 'facebook.com', 'twitter.com'],
        jobKeywords: ['position', 'interview', 'application', 'offer']
      })
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
});

ipcMain.handle('settings:update', async (event, settings) => {
  try {
    Object.entries(settings).forEach(([key, value]) => {
      getStore().set(key, value);
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
});

// Data import/export
ipcMain.handle('data:export', async () => {
  try {
    const jobs = getDb().prepare('SELECT * FROM jobs').all();
    const emailSync = getDb().prepare('SELECT gmail_message_id, processed_at, is_job_related FROM email_sync').all();
    const settings = await ipcMain.handle('settings:get');

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      jobs,
      emailSync,
      settings,
      stats: {
        totalJobs: jobs.length,
        totalEmailsProcessed: emailSync.length
      }
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
});

ipcMain.handle('data:import', async (event, jsonData) => {
  try {
    const data = JSON.parse(jsonData);
    
    // Validate version
    if (!data.version || data.version !== '1.0') {
      throw new Error('Incompatible data version');
    }

    // Import in transaction
    const importJobs = getDb().transaction(() => {
      // Clear existing data
      getDb().prepare('DELETE FROM jobs').run();
      getDb().prepare('DELETE FROM email_sync').run();

      // Import jobs
      const jobStmt = getDb().prepare(`
        INSERT INTO jobs (id, company, position, status, job_type, applied_date, location, salary_range, notes, source_email_id, ml_confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const job of data.jobs) {
        jobStmt.run(
          job.id,
          job.company,
          job.position,
          job.status,
          job.job_type,
          job.applied_date,
          job.location,
          job.salary_range,
          job.notes,
          job.source_email_id,
          job.ml_confidence,
          job.created_at,
          job.updated_at
        );
      }

      // Import email sync data
      const emailStmt = getDb().prepare(`
        INSERT OR IGNORE INTO email_sync (gmail_message_id, account_email, processed_at, is_job_related)
        VALUES (?, ?, ?, ?)
      `);

      for (const email of data.emailSync) {
        emailStmt.run(
          email.gmail_message_id,
          email.account_email || 'unknown@gmail.com', // Provide default for legacy data
          email.processed_at,
          email.is_job_related
        );
      }
    });

    importJobs();

    // Import settings
    if (data.settings) {
      await ipcMain.handle('settings:update', null, data.settings);
    }

    return { 
      success: true, 
      jobsImported: data.jobs.length,
      emailsImported: data.emailSync.length
    };
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
});

// File dialog operations
ipcMain.handle('dialog:select-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled) {
      const content = await fs.readFile(result.filePaths[0], 'utf8');
      return { path: result.filePaths[0], content };
    }
    
    return null;
  } catch (error) {
    console.error('Error selecting file:', error);
    throw error;
  }
});

ipcMain.handle('dialog:save-file', async (event, data) => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: `onlyjobs-export-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled) {
      await fs.writeFile(result.filePath, data);
      return { path: result.filePath, success: true };
    }
    
    return null;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
});

// System operations
ipcMain.handle('system:notification', async (event, title, body) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
    return { success: true };
  } catch (error) {
    console.error('Error showing notification:', error);
    throw error;
  }
});

ipcMain.handle('system:open-external', async (event, url) => {
  console.log('system:open-external called with URL:', url);
  try {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }
    await shell.openExternal(url);
    console.log('Successfully opened external URL');
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    throw error;
  }
});

// Window operations
ipcMain.handle('window:minimize', async () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.minimize();
});

ipcMain.handle('window:maximize', async () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('window:close', async () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.close();
});

// OAuth handlers
ipcMain.handle('initiate-oauth', async () => {
  try {
    // Open the web browser for OAuth
    const isDev = process.env.NODE_ENV === 'development';
    const webAppUrl = isDev 
      ? 'http://localhost:3001/login?electron=true'
      : 'https://onlyjobs-465420.web.app/login?electron=true';
    
    await shell.openExternal(webAppUrl);
    return { success: true, url: webAppUrl };
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    throw error;
  }
});

// Handle OAuth completion notification
ipcMain.handle('oauth-completed', async (event, data) => {
  try {
    console.log('OAuth completion data received:', data);
    
    // Show notification to user
    if (Notification.isSupported()) {
      new Notification({ 
        title: 'OnlyJobs Desktop', 
        body: 'OAuth completed in browser. You can now sign in to the desktop app.' 
      }).show();
    }
    
    // Focus main window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error handling OAuth completion:', error);
    throw error;
  }
});

// Multi-account Gmail handlers
ipcMain.handle('gmail:get-accounts', async () => {
  try {
    const gmailMultiAuth = getGmailMultiAuth();
    const accounts = gmailMultiAuth.getAllAccounts();
    return { success: true, accounts };
  } catch (error) {
    console.error('Error getting Gmail accounts:', error);
    throw error;
  }
});

ipcMain.handle('gmail:add-account', async () => {
  try {
    console.log('IPC: gmail:add-account called');
    
    const gmailMultiAuth = getGmailMultiAuth();
    const account = await gmailMultiAuth.addAccount();
    console.log('IPC: Gmail account added:', account.email);
    return { success: true, account };
  } catch (error) {
    console.error('IPC: Error adding Gmail account:', error);
    throw error;
  }
});

ipcMain.handle('gmail:remove-account', async (event, email) => {
  try {
    const gmailMultiAuth = getGmailMultiAuth();
    gmailMultiAuth.removeAccount(email);
    return { success: true };
  } catch (error) {
    console.error('Error removing Gmail account:', error);
    throw error;
  }
});

// Global sync cancellation flag
let syncCancelled = false;

// Cancel sync handler
ipcMain.handle('gmail:cancel-sync', async () => {
  console.log('🛑 SYNC: Cancellation requested');
  syncCancelled = true;
  return { success: true };
});

// Multi-account sync
ipcMain.handle('gmail:sync-all', async (event, options = {}) => {
  const syncStartTime = Date.now();
  console.log('🔄 SYNC: Starting sync process...');
  
  // Reset cancellation flag at start
  syncCancelled = false;
  
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    
    // Send immediate feedback that sync is starting
    if (mainWindow) {
      mainWindow.webContents.send('sync-progress', {
        current: 0,
        total: 1,
        status: 'Initializing sync...',
        phase: 'initializing'
      });
    }
    
    console.log('🔄 SYNC: Getting GmailMultiAuth instance...');
    const initStartTime = Date.now();
    const gmailMultiAuth = getGmailMultiAuth();
    console.log(`🔄 SYNC: GmailMultiAuth initialized in ${Date.now() - initStartTime}ms`);
    
    const accounts = gmailMultiAuth.getAllAccounts();
    console.log(`🔄 SYNC: Found ${accounts.length} accounts`);
    
    if (accounts.length === 0) {
      return {
        success: false,
        message: 'No Gmail accounts connected'
      };
    }
    
    // Initialize ThreadAwareProcessor for efficient processing
    let ThreadAwareProcessor;
    let processor;
    try {
      console.log('🔧 Attempting to load ThreadAwareProcessor...');
      ThreadAwareProcessor = require('./thread-aware-processor');
      processor = new ThreadAwareProcessor(mainWindow);
      console.log('✅ ThreadAwareProcessor loaded successfully');
    } catch (loadError) {
      console.error('❌ Failed to load ThreadAwareProcessor:', loadError);
      console.error('Stack:', loadError.stack);
    }
    
    console.log(`Starting sync for ${accounts.length} accounts...`);
    const { daysToSync = 90, maxEmails = 50000, modelId = null } = options; // High default to get all emails in period
    console.log(`Sync options - daysToSync: ${daysToSync}, maxEmails: ${maxEmails}, modelId: ${modelId || 'default'}`);
    
    let totalEmailsFetched = 0;
    let totalEmailsClassified = 0;
    let totalJobsFound = 0;
    let totalEmailsSkipped = 0;
    const foundJobs = []; // Track found jobs for notification
    
    // Update sync status
    const updateStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_fetch_time = CURRENT_TIMESTAMP,
        last_sync_status = 'syncing'
      WHERE id = 1
    `);
    updateStatus.run();
    
    // Sync each account
    for (let i = 0; i < accounts.length; i++) {
      // Check for cancellation
      if (syncCancelled) {
        console.log('🛑 SYNC: Cancelled by user');
        if (mainWindow) {
          mainWindow.webContents.send('sync-cancelled', {
            message: 'Sync cancelled by user'
          });
        }
        return {
          success: false,
          message: 'Sync cancelled by user',
          stats: {
            totalEmailsFetched,
            totalEmailsClassified,
            totalJobsFound,
            cancelled: true
          }
        };
      }
      
      const account = accounts[i];
      
      mainWindow.webContents.send('sync-progress', {
        current: i,
        total: accounts.length,
        status: `Connecting to ${account.email}...`,
        account: account.email,
        phase: 'fetching',
        details: `Searching for emails from the last ${daysToSync} days`
      });
      
      try {
        // Fetch emails from this account
        // Calculate date for 'after' query
        const afterDate = new Date();
        afterDate.setDate(afterDate.getDate() - daysToSync);
        const dateString = afterDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        const today = new Date().toISOString().split('T')[0];
        console.log(`Fetching emails for ${account.email} from ${dateString} to ${today}`);
        console.log(`Query params: maxResults=${maxEmails}, query="in:inbox after:${dateString}"`);
        
        // Send more detailed progress with date range
        mainWindow.webContents.send('sync-progress', {
          current: i,
          total: accounts.length,
          status: `Fetching emails from ${account.email}...`,
          account: account.email,
          phase: 'fetching',
          details: `Searching from ${dateString} to today (${daysToSync} days)`
        });
        
        const fetchStartTime = Date.now();
        console.log(`🔄 SYNC: Fetching emails from Gmail API for ${account.email}...`);
        
        const fetchResult = await gmailMultiAuth.fetchEmailsFromAccount(account.email, {
          maxResults: maxEmails,
          query: `in:inbox after:${dateString}`
        });
        
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`🔄 SYNC: Gmail API fetch completed in ${fetchDuration}ms`);
        console.log('Fetch result:', {
          hasMessages: !!fetchResult.messages,
          messageCount: fetchResult.messages ? fetchResult.messages.length : 0,
          nextPageToken: fetchResult.nextPageToken,
          accountEmail: fetchResult.accountEmail,
          fetchTimeMs: fetchDuration
        });
        
        console.log('🔍 DEBUG: About to check fetchResult.messages...');
        console.log('🔍 DEBUG: fetchResult structure:', Object.keys(fetchResult));
        console.log('🔍 DEBUG: fetchResult.messages exists?', !!fetchResult.messages);
        console.log('🔍 DEBUG: fetchResult.messages is array?', Array.isArray(fetchResult.messages));
        
        if (!fetchResult.messages || fetchResult.messages.length === 0) {
          console.log(`No messages found for ${account.email}`);
          continue;
        }
        
        console.log('🔍 DEBUG: Passed the messages check, about to reverse...');
        
        // CRITICAL: Reverse emails to process oldest → newest for proper timeline
        console.log(`📅 Sorting ${fetchResult.messages.length} emails chronologically (oldest first)...`);
        fetchResult.messages.reverse();
        
        // Send progress update about thread-aware processing
        mainWindow.webContents.send('sync-progress', {
          current: i,
          total: accounts.length,
          status: `Processing ${fetchResult.messages.length} emails with thread-aware system...`,
          account: account.email,
          phase: 'processing',
          details: `Using intelligent thread grouping and 3-stage classification`
        });
        
        // Use ThreadAwareProcessor for efficient processing
        console.log('🧵 Using Thread-Aware Processor for efficient processing...');
        const processorStartTime = Date.now();
        
        // Send initial processing status with thread count
        if (mainWindow) {
          mainWindow.webContents.send('sync-progress', {
            stage: 'Starting email classification...',
            details: {
              totalThreads: fetchResult.messages.length, // Will be refined after grouping
              threadsProcessed: 0
            }
          });
        }
        
        try {
          if (!processor) {
            throw new Error('ThreadAwareProcessor not initialized');
          }
          console.log('🧵 Calling processor.processEmails...');
          const result = await processor.processEmails(
            fetchResult.messages,
            account,
            modelId || 'llama-3-8b-instruct-q5_k_m',
            () => syncCancelled // Pass cancellation check function
          );
          
          // Extract jobs array from result
          const jobs = result.jobs || [];
          
          const processingTime = Date.now() - processorStartTime;
          console.log(`✅ Thread-aware processing completed in ${processingTime}ms`);
          console.log(`   Found ${jobs.length} jobs from ${fetchResult.messages.length} emails`);
          console.log(`   Stats:`, result.stats);
          
          // Send completion update
          if (mainWindow) {
            mainWindow.webContents.send('sync-progress', {
              stage: 'Classification complete',
              details: {
                totalThreads: result.stats?.threads || 0,
                threadsProcessed: result.stats?.threads || 0,
                jobsFound: jobs.length
              }
            });
          }
          
          // Store jobs in database
          console.log(`📝 Attempting to save ${jobs.length} jobs to database...`);
          for (const job of jobs) {
            try {
              console.log(`  Processing job: ${job.company} - ${job.position}`);
              
              // Get the first email ID to use as gmail_message_id (required field)
              const primaryEmailId = job.emails && job.emails.length > 0 ? job.emails[0].id : null;
              if (!primaryEmailId) {
                console.error(`  ❌ No email ID found for job ${job.company} - ${job.position}`);
                continue;
              }
              
              // Check if job already exists (by thread_id or similarity)
              const existingJobStmt = getDb().prepare(`
                SELECT id FROM jobs 
                WHERE thread_id = ? AND account_email = ?
                LIMIT 1
              `);
              
              const existingJob = job.threadId ? 
                existingJobStmt.get(job.threadId, account.email) : 
                null;
              
              if (existingJob) {
                // Update existing job
                const updateJobStmt = getDb().prepare(`
                  UPDATE jobs SET
                    status = ?,
                    last_updated = CURRENT_TIMESTAMP,
                    email_thread_ids = ?
                  WHERE id = ?
                `);
                
                updateJobStmt.run(
                  job.status,
                  JSON.stringify(job.emails.map(e => e.id)),
                  existingJob.id
                );
                
                console.log(`Updated existing job: ${job.company} - ${job.position}`);
              } else {
                // Insert new job
                const insertJobStmt = getDb().prepare(`
                  INSERT INTO jobs (
                    id, gmail_message_id, thread_id, company, position, status,
                    applied_date, account_email, confidence_score,
                    classification_model, email_thread_ids
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const appliedDate = job.firstEmailDate ? 
                  job.firstEmailDate.toISOString().split('T')[0] : 
                  new Date().toISOString().split('T')[0];
                
                insertJobStmt.run(
                  jobId,
                  primaryEmailId,  // Use first email ID as gmail_message_id
                  job.threadId || null,
                  job.company,
                  job.position,
                  job.status,
                  appliedDate,
                  account.email,
                  job.confidence || 0.85,
                  'thread_aware_llm',
                  JSON.stringify(job.emails.map(e => e.id))
                );
                
                console.log(`✅ Saved new job: ${job.company} - ${job.position}`);
                totalJobsFound++;
                foundJobs.push({
                  company: job.company,
                  position: job.position,
                  status: job.status
                });
                
                // Send progress update for found job
                mainWindow.webContents.send('sync-progress', {
                  current: i,
                  total: accounts.length,
                  status: `Found job application!`,
                  account: account.email,
                  phase: 'saving',
                  details: `✅ ${job.company} - ${job.position} (${job.emails.length} emails in thread)`
                });
              }
              
              // Update email_sync records
              for (const email of job.emails) {
                const updateSyncStmt = getDb().prepare(`
                  INSERT OR REPLACE INTO email_sync (gmail_message_id, account_email, is_job_related)
                  VALUES (?, ?, 1)
                `);
                updateSyncStmt.run(email.id, account.email);
              }
            } catch (dbError) {
              console.error(`❌ Error saving job ${job.company} - ${job.position}:`, dbError);
              console.error(`  Job data:`, {
                threadId: job.threadId,
                primaryEmailId,
                emailCount: job.emails?.length || 0,
                accountEmail: account.email
              });
            }
          }
          console.log(`✅ Job saving complete: ${totalJobsFound} jobs saved successfully`);
          
          totalEmailsFetched += fetchResult.messages.length;
          totalEmailsClassified += fetchResult.messages.length;
          
        } catch (processingError) {
          console.error('Error in thread-aware processing:', processingError);
          
          // Fall back to simple processing if thread processor fails
          console.log('⚠️ Falling back to simple email processing...');
          
          // Process each email directly (OLD FLOW - kept as fallback)
          let emailIndex = 0;
          for (const email of fetchResult.messages) {
            emailIndex++;
            
            // Extract subject early for progress display
            const headers = email.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
          
            // Send detailed progress update for each email
            const percentComplete = Math.round((emailIndex / fetchResult.messages.length) * 100);
            mainWindow.webContents.send('sync-progress', {
              current: i,
              total: accounts.length,
              status: `Fallback: Processing emails from ${account.email}`,
              account: account.email,
              emailProgress: {
                current: emailIndex,
                total: fetchResult.messages.length
              },
              phase: 'classifying',
              details: `Analyzing: "${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}"`
            });
            
            try {
            // Use atomic INSERT OR IGNORE to check and mark as processing in one operation
            // This eliminates the race condition between check and insert
            const insertSyncStmt = getDb().prepare(`
              INSERT OR IGNORE INTO email_sync (gmail_message_id, account_email, is_job_related)
              VALUES (?, ?, 0)
            `);
            const syncResult = insertSyncStmt.run(email.id, account.email);
            
            // Only proceed if the record was actually inserted (not a duplicate)
            if (syncResult.changes === 0) {
              console.log(`Email ${email.id} already processed for ${account.email}, skipping...`);
              totalEmailsSkipped++;
              continue;
            }
            
            // Extract remaining email info for classification
            const from = headers.find(h => h.name === 'From')?.value || '';
            const emailContent = _extractEmailContent(email);
            
            // Pure LLM classification using two-stage approach
            let classification;
            let confidence;
            let classificationMethod = 'two_stage_llm';
            
            // Send classification start update
            mainWindow.webContents.send('sync-progress', {
              current: i,
              total: accounts.length,
              status: `Analyzing email from ${account.email}`,
              account: account.email,
              emailProgress: {
                current: emailIndex,
                total: fetchResult.messages.length
              },
              phase: 'classifying',
              details: `Using AI to check if this is job-related: "${subject.substring(0, 40)}..."`
            });
            
            // Classify with two-stage approach via classifier
            // Build proper email format with subject
            const emailWithSubject = `Subject: ${subject}\n${emailContent}`;
            classification = await classifier.parse({ 
              subject, 
              plaintext: emailContent,
              modelId 
            });
            
            // Calculate confidence based on result completeness
            confidence = 0.7; // Base confidence
            if (classification.is_job_related) {
              if (classification.company && classification.company !== 'Unknown') confidence += 0.1;
              if (classification.position && classification.position !== 'Unknown Position') confidence += 0.1;
              if (classification.status) confidence += 0.05;
              confidence = Math.min(confidence, 0.95);
            } else {
              confidence = 0.8; // Non-job emails are usually clear
            }
            
            // Log classification result
            console.log(`🤖 LLM classification: ${classification.is_job_related ? 'JOB' : 'NOT_JOB'} (${(confidence * 100).toFixed(0)}% confidence)`);
            if (classification.is_job_related) {
              console.log(`   Company: ${classification.company || 'Unknown'}`);
              console.log(`   Position: ${classification.position || 'Unknown'}`);
              console.log(`   Status: ${classification.status || 'Unknown'}`);
            }
            
            // Calculate retention days for uncertain classifications (confidence < 70%)
            const retentionDays = confidence < 0.7 ? 7 : 0;
            
            // Decide where to store based on confidence and classification
            const shouldStoreAsJob = classification.is_job_related && confidence >= 0.6;
            const shouldStoreForReview = !shouldStoreAsJob && retentionDays > 0;
            
            // Send classification result update
            if (classification.is_job_related) {
              mainWindow.webContents.send('sync-progress', {
                current: i,
                total: accounts.length,
                status: `Found job application from ${account.email}!`,
                account: account.email,
                emailProgress: {
                  current: emailIndex,
                  total: fetchResult.messages.length
                },
                phase: 'saving',
                details: `✅ Job found: ${classification.company || 'Unknown Company'} - ${classification.position || 'Unknown Position'} (confidence: ${(confidence * 100).toFixed(0)}%)`
              });
            } else if (shouldStoreForReview) {
              mainWindow.webContents.send('sync-progress', {
                current: i,
                total: accounts.length,
                status: `Storing uncertain email for review`,
                account: account.email,
                emailProgress: {
                  current: emailIndex,
                  total: fetchResult.messages.length
                },
                phase: 'review',
                details: `📋 Low confidence (${(confidence * 100).toFixed(0)}%), storing for review`
              });
            }
            
            // Update the record with classification result
            const updateSyncStmt = getDb().prepare(`
              UPDATE email_sync 
              SET is_job_related = ?
              WHERE gmail_message_id = ? AND account_email = ?
            `);
            updateSyncStmt.run(classification.is_job_related ? 1 : 0, email.id, account.email);
            
            totalEmailsFetched++;
            
            // Skip storing for review if uncertain (feature not implemented yet)
            if (shouldStoreForReview) {
              console.log(`Email marked for review (low confidence), skipping job storage`);
              totalEmailsClassified++;
              continue; // Don't store in jobs table
            }
            
            // If high-confidence job-related, create or update job entry
            if (shouldStoreAsJob) {
              // Create similarity key for deduplication (still stored for backwards compatibility)
              const company = classification.company || 'Unknown';
              const position = classification.position || 'Unknown Position';
              const similarityKey = `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}_${position.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
              
              // Check for existing similar job within 30 days using LLM matching
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              
              // First, get potential matches based on company name (to limit LLM calls)
              const potentialMatchesStmt = getDb().prepare(`
                SELECT id, company, position, status, email_history 
                FROM jobs 
                WHERE account_email = ?
                  AND applied_date > ?
                  AND (company LIKE ? OR position LIKE ?)
                ORDER BY applied_date DESC
                LIMIT 10
              `);
              
              const potentialMatches = potentialMatchesStmt.all(
                account.email, 
                thirtyDaysAgo.toISOString(),
                `%${company}%`,
                `%${position}%`
              );
              
              // Use LLM to find actual match
              let existingJob = null;
              const twoStage = require('./llm/two-stage-classifier');
              
              for (const potentialMatch of potentialMatches) {
                try {
                  // Use the same model for matching as was used for classification
                  const modelPath = `/Users/ndting/Library/Application Support/models/${modelId || 'llama-3-8b-instruct-q5_k_m'}.gguf`;
                  const matchResult = await twoStage.matchJobs(
                    modelId || 'llama-3-8b-instruct-q5_k_m',
                    modelPath,
                    { company: classification.company, position: classification.position, status: classification.status },
                    { company: potentialMatch.company, position: potentialMatch.position, status: potentialMatch.status }
                  );
                  
                  if (matchResult.same_job) {
                    existingJob = potentialMatch;
                    console.log(`LLM matched existing job: ${potentialMatch.company} - ${potentialMatch.position}`);
                    break;
                  }
                } catch (matchError) {
                  console.error('Error in LLM job matching:', matchError);
                  // Fall back to similarity key matching if LLM fails
                  const jobSimilarityKey = `${potentialMatch.company.toLowerCase().replace(/[^a-z0-9]/g, '')}_${potentialMatch.position.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                  if (jobSimilarityKey === similarityKey) {
                    existingJob = potentialMatch;
                    console.log(`Fallback: Matched by similarity key: ${potentialMatch.company} - ${potentialMatch.position}`);
                    break;
                  }
                }
              }
              
              if (existingJob) {
                // Update existing job with new email
                console.log(`Found existing job for ${company} - ${position}, updating...`);
                
                // Parse existing email history
                let emailHistory = [];
                try {
                  emailHistory = JSON.parse(existingJob.email_history || '[]');
                } catch (e) {
                  emailHistory = [];
                }
                
                // Add this email to history
                emailHistory.push({
                  gmail_message_id: email.id,
                  date: _extractDate(email),
                  subject: subject
                });
                
                // Update status if new one is higher priority
                const statusPriority = { 'Applied': 1, 'Interviewed': 2, 'Declined': 3, 'Offer': 4 };
                const currentPriority = statusPriority[existingJob.status] || 0;
                const newStatus = classification.status ? 
                  (classification.status.toLowerCase().includes('interview') ? 'Interviewed' :
                   classification.status.toLowerCase().includes('offer') ? 'Offer' :
                   classification.status.toLowerCase().includes('declined') || classification.status.toLowerCase().includes('reject') ? 'Declined' :
                   'Applied') : 'Applied';
                const newPriority = statusPriority[newStatus] || 1;
                
                const finalStatus = newPriority > currentPriority ? newStatus : existingJob.status;
                
                // Update the job
                const updateJobStmt = getDb().prepare(`
                  UPDATE jobs 
                  SET status = ?,
                      email_history = ?,
                      email_content = ?
                  WHERE id = ?
                `);
                
                updateJobStmt.run(
                  finalStatus,
                  JSON.stringify(emailHistory),
                  emailContent,
                  existingJob.id
                );
                
                totalJobsFound++;
                foundJobs.push({
                  ...existingJob,
                  status: finalStatus,
                  updated: true
                });
                
              } else {
                // Create new job
                const jobId = `job_${Date.now()}_${performance.now().toString().replace('.', '_')}_${Math.random().toString(36).substr(2, 9)}`;
                const jobStmt = getDb().prepare(`
                  INSERT OR IGNORE INTO jobs (id, gmail_message_id, company, position, status, applied_date, account_email, from_address, notes, similarity_key, email_history, email_content)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
              
              // Map LLM status to our 4-state system
              let status = 'Applied';
              if (classification.status) {
                const statusLower = classification.status.toLowerCase();
                if (statusLower.includes('interview')) status = 'Interviewed';
                else if (statusLower.includes('offer')) status = 'Offer';
                else if (statusLower.includes('declined') || statusLower.includes('reject')) status = 'Declined';
              }
              
              const extractedDate = _extractDate(email);
              console.log(`Storing job with extracted date: ${extractedDate}`);
              console.log('Job data being inserted:', {
                jobId,
                gmail_message_id: email.id,
                company: classification.company || _extractCompany(emailContent),
                position: classification.position || _extractPosition(emailContent),
                status,
                applied_date: extractedDate,
                account_email: account.email
              });
              
              // Initial email history
              const emailHistory = [{
                gmail_message_id: email.id,
                date: extractedDate,
                subject: subject
              }];
              
              const jobResult = jobStmt.run(
                jobId,
                email.id,
                classification.company || _extractCompany(emailContent),
                classification.position || _extractPosition(emailContent),
                status,
                extractedDate,
                account.email,
                from,
                email.snippet || '',
                similarityKey,
                JSON.stringify(emailHistory),
                emailContent
              );
              
              console.log('Job insert result:', { changes: jobResult.changes, lastInsertRowid: jobResult.lastInsertRowid });
              
              // Only count if job was actually inserted (not ignored due to duplicate)
              if (jobResult.changes > 0) {
                totalJobsFound++;
                console.log(`✅ Job inserted successfully: ${classification.company} - ${classification.position}`);
                
                // Send real-time job update to frontend
                const mainWindow = BrowserWindow.getAllWindows()[0];
                if (mainWindow) {
                  const newJob = {
                    id: jobId,
                    gmail_message_id: email.id,
                    company: classification.company || _extractCompany(emailContent),
                    position: classification.position || _extractPosition(emailContent),
                    status,
                    applied_date: extractedDate,
                    account_email: account.email,
                    from_address: from,
                    notes: email.snippet || '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  };
                  mainWindow.webContents.send('job-found', newJob);
                }
              }
              }
            }
            } catch (error) {
              console.error(`Error processing email ${email.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error syncing account ${account.email}:`, error);
      }
    }
    
    console.log(`Processed ${totalEmailsFetched} emails, found ${totalJobsFound} jobs from ${accounts.length} accounts`);
    totalEmailsClassified = totalEmailsFetched; // All processed emails are classified
    
    // Update final sync status
    const finalUpdate = getDb().prepare(`
      UPDATE sync_status SET 
        last_sync_status = 'completed',
        total_emails_fetched = total_emails_fetched + ?,
        total_emails_classified = total_emails_classified + ?,
        total_jobs_found = total_jobs_found + ?
      WHERE id = 1
    `);
    finalUpdate.run(totalEmailsFetched, totalEmailsClassified, totalJobsFound);
    
    // Log to sync history
    const syncEnd = Date.now();
    const duration = syncEnd - syncStartTime;
    const historyInsert = getDb().prepare(`
      INSERT INTO sync_history (
        accounts_synced, emails_fetched, emails_processed, emails_classified,
        jobs_found, new_jobs, updated_jobs, duration_ms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    historyInsert.run(
      accounts.length,
      totalEmailsFetched,
      totalEmailsFetched,
      totalEmailsClassified,
      totalJobsFound,
      totalJobsFound, // For now, assume all are new
      0, // Updated jobs tracking needs improvement
      duration,
      'completed'
    );
    
    mainWindow.webContents.send('sync-complete', {
      emailsFetched: totalEmailsFetched,
      emailsClassified: totalEmailsClassified,
      jobsFound: totalJobsFound,
      emailsSkipped: totalEmailsSkipped,
      accounts: accounts.length
    });
    
    return {
      success: true,
      emailsFetched: totalEmailsFetched,
      emailsClassified: totalEmailsClassified,
      jobsFound: totalJobsFound,
      emailsSkipped: totalEmailsSkipped,
      accounts: accounts.length
    };
  } catch (error) {
    console.error('Multi-account sync error:', error);
    throw error;
  }
});

// Removed duplicate handler - use db:clear-email-sync instead

// Database management operations
ipcMain.handle('db:clear-all-records', async () => {
  try {
    console.log('🗑️ Clearing all database records...');
    
    // Get the database instance first
    const db = getDb();
    console.log('📊 Database instance obtained');
    
    // Check current counts before clearing
    const beforeCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      jobs: db.prepare('SELECT COUNT(*) as count FROM jobs').get().count,
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0,
      trainingFeedback: db.prepare('SELECT COUNT(*) as count FROM training_feedback').get()?.count || 0
    };
    console.log('📊 Current record counts:', beforeCounts);
    
    // Use a transaction to ensure all operations succeed or fail together
    const clearAll = db.transaction(() => {
      // Clear all tables in the correct order (respecting foreign key constraints if any)
      const clearClassificationQueue = db.prepare('DELETE FROM classification_queue');
      const clearTrainingFeedback = db.prepare('DELETE FROM training_feedback');
      const clearEmailSync = db.prepare('DELETE FROM email_sync');
      const clearJobs = db.prepare('DELETE FROM jobs');
      const clearGmailAccounts = db.prepare('DELETE FROM gmail_accounts');
      const clearLlmCache = db.prepare('DELETE FROM llm_cache');
      const resetSyncStatus = db.prepare('UPDATE sync_status SET last_fetch_time = NULL, last_classify_time = NULL, last_sync_status = NULL, total_emails_fetched = 0, total_emails_classified = 0, total_jobs_found = 0 WHERE id = 1');
      
      const classificationQueueResult = clearClassificationQueue.run();
      console.log(`Deleted ${classificationQueueResult.changes} classification_queue records`);
      
      const trainingFeedbackResult = clearTrainingFeedback.run();
      console.log(`Deleted ${trainingFeedbackResult.changes} training_feedback records`);
      
      const emailSyncResult = clearEmailSync.run();
      console.log(`Deleted ${emailSyncResult.changes} email_sync records`);
      
      const jobsResult = clearJobs.run();
      console.log(`Deleted ${jobsResult.changes} jobs records`);
      
      const gmailAccountsResult = clearGmailAccounts.run();
      console.log(`Deleted ${gmailAccountsResult.changes} gmail_accounts records`);
      
      const llmCacheResult = clearLlmCache.run();
      console.log(`Deleted ${llmCacheResult.changes} llm_cache records`);
      
      resetSyncStatus.run();
      console.log('Reset sync status');
      
      return {
        classificationQueueDeleted: classificationQueueResult.changes,
        trainingFeedbackDeleted: trainingFeedbackResult.changes,
        emailSyncDeleted: emailSyncResult.changes,
        jobsDeleted: jobsResult.changes,
        gmailAccountsDeleted: gmailAccountsResult.changes,
        llmCacheDeleted: llmCacheResult.changes
      };
    });
    
    const result = clearAll();
    
    // Verify the deletion
    const afterCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      jobs: db.prepare('SELECT COUNT(*) as count FROM jobs').get().count,
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0,
      trainingFeedback: db.prepare('SELECT COUNT(*) as count FROM training_feedback').get()?.count || 0
    };
    console.log('📊 After clearing - record counts:', afterCounts);
    
    console.log('✅ Database cleared successfully:', result);
    
    return {
      success: true,
      message: `All database records have been cleared successfully. Deleted: ${result.classificationQueueDeleted} classifications, ${result.emailSyncDeleted} email sync records, ${result.jobsDeleted} jobs, ${result.gmailAccountsDeleted} accounts`,
      details: result
    };
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

ipcMain.handle('db:clear-email-sync', async () => {
  try {
    console.log('🗑️ Clearing email sync history and related classifications...');
    
    const db = getDb();
    
    // Check current counts before clearing
    const beforeCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0
    };
    console.log(`📊 Current records - email_sync: ${beforeCounts.emailSync}, classification_queue: ${beforeCounts.classificationQueue}`);
    
    // Clear both email_sync and classification_queue since they're related
    const clearEmailSync = db.prepare('DELETE FROM email_sync');
    const clearClassificationQueue = db.prepare('DELETE FROM classification_queue');
    
    const emailSyncResult = clearEmailSync.run();
    console.log(`Deleted ${emailSyncResult.changes} email_sync records`);
    
    const classificationResult = clearClassificationQueue.run();
    console.log(`Deleted ${classificationResult.changes} classification_queue records`);
    
    // Reset sync status counters
    const resetStmt = db.prepare('UPDATE sync_status SET total_emails_fetched = 0, total_emails_classified = 0, last_sync_status = NULL WHERE id = 1');
    resetStmt.run();
    console.log('Reset sync status counters');
    
    // Verify the deletion
    const afterCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0
    };
    console.log(`📊 After clearing - email_sync: ${afterCounts.emailSync}, classification_queue: ${afterCounts.classificationQueue}`);
    
    console.log(`✅ Cleared ${emailSyncResult.changes} email sync records and ${classificationResult.changes} classification records`);
    
    return {
      success: true,
      message: `Email sync history cleared successfully (${emailSyncResult.changes} email records and ${classificationResult.changes} classification records deleted)`,
      recordsDeleted: emailSyncResult.changes + classificationResult.changes
    };
  } catch (error) {
    console.error('❌ Error clearing email sync history:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

// Clear job data but keep Gmail accounts
ipcMain.handle('db:clear-job-data', async () => {
  try {
    console.log('🗑️ Clearing job data (keeping Gmail accounts)...');
    
    const db = getDb();
    
    // Check current counts before clearing
    const beforeCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      jobs: db.prepare('SELECT COUNT(*) as count FROM jobs').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0,
      trainingFeedback: db.prepare('SELECT COUNT(*) as count FROM training_feedback').get()?.count || 0,
      llmCache: db.prepare('SELECT COUNT(*) as count FROM llm_cache').get()?.count || 0,
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count
    };
    console.log('📊 Current record counts:', beforeCounts);
    
    // Clear all job-related data, but NOT gmail_accounts
    const emailSyncDeleted = db.prepare('DELETE FROM email_sync').run().changes;
    console.log(`Deleted ${emailSyncDeleted} email_sync records`);
    
    const jobsDeleted = db.prepare('DELETE FROM jobs').run().changes;
    console.log(`Deleted ${jobsDeleted} jobs records`);
    
    // Clear classification-related tables
    const classificationQueueDeleted = db.prepare('DELETE FROM classification_queue').run().changes;
    console.log(`Deleted ${classificationQueueDeleted} classification_queue records`);
    
    const trainingFeedbackDeleted = db.prepare('DELETE FROM training_feedback').run().changes;
    console.log(`Deleted ${trainingFeedbackDeleted} training_feedback records`);
    
    const llmCacheDeleted = db.prepare('DELETE FROM llm_cache').run().changes;
    console.log(`Deleted ${llmCacheDeleted} llm_cache records`);
    
    // Reset sync status but keep account info
    db.prepare('UPDATE sync_status SET total_emails_fetched = 0, total_emails_classified = 0, last_sync_status = NULL WHERE id = 1').run();
    console.log('Reset sync status');
    
    // Update last_sync dates for gmail accounts but keep them connected
    db.prepare('UPDATE gmail_accounts SET last_sync = NULL').run();
    console.log('Reset Gmail account sync dates');
    
    // Check counts after clearing
    const afterCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      jobs: db.prepare('SELECT COUNT(*) as count FROM jobs').get().count,
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0,
      trainingFeedback: db.prepare('SELECT COUNT(*) as count FROM training_feedback').get()?.count || 0,
      llmCache: db.prepare('SELECT COUNT(*) as count FROM llm_cache').get()?.count || 0,
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count
    };
    console.log('📊 After clearing - record counts:', afterCounts);
    
    return {
      success: true,
      message: `Job data cleared successfully. ${beforeCounts.gmailAccounts} Gmail account(s) remain connected.`,
      emailSyncDeleted,
      jobsDeleted,
      classificationQueueDeleted,
      trainingFeedbackDeleted,
      llmCacheDeleted,
      gmailAccountsKept: beforeCounts.gmailAccounts
    };
  } catch (error) {
    console.error('❌ Error clearing job data:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

// Clear classifications only (keeps email sync and jobs)
ipcMain.handle('db:clear-classifications', async () => {
  try {
    console.log('🗑️ Clearing classification data only...');
    
    const db = getDb();
    
    // Check current counts before clearing
    const beforeCounts = {
      classificationQueue: db.prepare('SELECT COUNT(*) as count FROM classification_queue').get()?.count || 0,
      trainingFeedback: db.prepare('SELECT COUNT(*) as count FROM training_feedback').get()?.count || 0,
      llmCache: db.prepare('SELECT COUNT(*) as count FROM llm_cache').get()?.count || 0
    };
    console.log('📊 Current classification counts:', beforeCounts);
    
    // Clear classification-related tables only
    const classificationQueueDeleted = db.prepare('DELETE FROM classification_queue').run().changes;
    console.log(`Deleted ${classificationQueueDeleted} classification_queue records`);
    
    const trainingFeedbackDeleted = db.prepare('DELETE FROM training_feedback').run().changes;
    console.log(`Deleted ${trainingFeedbackDeleted} training_feedback records`);
    
    const llmCacheDeleted = db.prepare('DELETE FROM llm_cache').run().changes;
    console.log(`Deleted ${llmCacheDeleted} llm_cache records`);
    
    // Update sync status for classification count
    db.prepare('UPDATE sync_status SET total_emails_classified = 0 WHERE id = 1').run();
    console.log('Reset classification count in sync status');
    
    return {
      success: true,
      message: 'Classification data cleared successfully. Email sync history and job records remain intact.',
      classificationQueueDeleted,
      trainingFeedbackDeleted,
      llmCacheDeleted
    };
  } catch (error) {
    console.error('❌ Error clearing classification data:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

// Get email content for a job
ipcMain.handle('get-job-email', async (event, jobId) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT email_content, email_history 
      FROM jobs 
      WHERE id = ?
    `);
    const result = stmt.get(jobId);
    
    if (result) {
      return {
        success: true,
        emailContent: result.email_content,
        emailHistory: JSON.parse(result.email_history || '[]')
      };
    } else {
      return { success: false, error: 'Job not found' };
    }
  } catch (error) {
    console.error('Error fetching job email:', error);
    return { success: false, error: error.message };
  }
});

// Prompt management handlers
ipcMain.handle('prompt:get', async () => {
  // Try to get from store first, fallback to promptManager
  const storedPrompt = promptStore.get('classificationPrompt');
  if (storedPrompt) {
    return storedPrompt;
  }
  return await promptManager.getPrompt();
});

ipcMain.handle('prompt:save', async (event, prompt) => {
  // Save to store and to file for LLM engine
  promptStore.set('classificationPrompt', prompt);
  
  // Also save to file for LLM engine to use
  const promptPath = path.join(app.getPath('userData'), 'classificationPrompt.txt');
  await fs.writeFile(promptPath, prompt, 'utf-8');
  
  return { success: true };
});

ipcMain.handle('prompt:set', async (event, prompt) => {
  return await promptManager.setPrompt(prompt);
});

ipcMain.handle('prompt:reset', async () => {
  // Clear from store and delete file
  promptStore.delete('classificationPrompt');
  
  const promptPath = path.join(app.getPath('userData'), 'classificationPrompt.txt');
  try {
    await fs.unlink(promptPath);
  } catch (error) {
    // File might not exist, that's ok
  }
  
  return await promptManager.resetPrompt();
});

ipcMain.handle('prompt:info', async () => {
  return await promptManager.getPromptInfo();
});

// Test prompt with a sample email
ipcMain.handle('prompt:test', async (event, { prompt, email }) => {
  return await promptManager.testPrompt(prompt, email);
});

// Get token info for a text
ipcMain.handle('prompt:token-info', async (event, text) => {
  return await promptManager.getTokenInfo(text);
});

// Model testing handlers
const ModelManager = require('./model-manager');
const modelManager = new ModelManager();
const { classifyWithAllModels } = require('./llm/multi-model-engine');

// Get all models and their statuses
ipcMain.handle('models:get-all', async () => {
  try {
    const models = modelManager.getAllModels();
    const statuses = await modelManager.getAllModelStatuses();
    return { 
      success: true, 
      models, 
      statuses 
    };
  } catch (error) {
    console.error('Error getting models:', error);
    return { success: false, error: error.message };
  }
});

// Download a model
ipcMain.handle('models:download', async (event, modelId) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    
    const result = await modelManager.downloadModel(modelId, (progress) => {
      // Send progress updates to renderer
      if (mainWindow) {
        mainWindow.webContents.send('model-download-progress', progress);
      }
    });
    
    // Send completion event
    if (mainWindow) {
      mainWindow.webContents.send('model-download-complete', { modelId, ...result });
    }
    
    return { success: true, result };
  } catch (error) {
    console.error(`Error downloading model ${modelId}:`, error);
    return { success: false, error: error.message };
  }
});

// Delete a model
ipcMain.handle('models:delete', async (event, modelId) => {
  try {
    const deleted = await modelManager.deleteModel(modelId);
    return { success: true, deleted };
  } catch (error) {
    console.error(`Error deleting model ${modelId}:`, error);
    return { success: false, error: error.message };
  }
});

// Run comparison across models
ipcMain.handle('models:run-comparison', async (event, { subject, body, customPrompt }) => {
  try {
    // Get all ready models
    const statuses = await modelManager.getAllModelStatuses();
    const readyModels = [];
    
    for (const [modelId, status] of Object.entries(statuses)) {
      if (status.status === 'ready') {
        readyModels.push({
          modelId,
          modelPath: status.path
        });
      }
    }
    
    if (readyModels.length === 0) {
      throw new Error('No models are ready for comparison');
    }
    
    console.log(`Running comparison with ${readyModels.length} models`);
    
    // Run classification with all ready models
    const options = {};
    if (customPrompt) {
      options.customPrompt = customPrompt;
      console.log('Using custom prompt for comparison');
    }
    
    const results = await classifyWithAllModels(readyModels, subject, body, options);
    
    // Store results in database
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const db = getDb();
    
    // Ensure test results table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT,
        model_name TEXT,
        email_subject TEXT,
        email_body TEXT,
        classification_result TEXT,
        processing_time_ms INTEGER,
        raw_response TEXT,
        tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Store each result
    const stmt = db.prepare(`
      INSERT INTO model_test_results (test_id, model_name, email_subject, email_body, classification_result, processing_time_ms, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const result of results.results) {
      stmt.run(
        testId,
        result.modelId,
        subject,
        body,
        JSON.stringify(result.result),
        result.processingTime,
        result.rawResponse
      );
    }
    
    return { success: true, ...results };
  } catch (error) {
    console.error('Error running comparison:', error);
    return { success: false, error: error.message };
  }
});

// Get default prompts for models
ipcMain.handle('models:get-default-prompts', async () => {
  try {
    const { getAllDefaultPrompts } = require('./llm/multi-model-engine');
    const prompts = getAllDefaultPrompts();
    return { success: true, prompts };
  } catch (error) {
    console.error('Error getting default prompts:', error);
    return { success: false, error: error.message };
  }
});

// Get recent emails directly from Gmail for testing
ipcMain.handle('models:get-recent-emails', async () => {
  try {
    const gmailMultiAuth = getGmailMultiAuth();
    const accounts = gmailMultiAuth.getAllAccounts();
    
    if (accounts.length === 0) {
      return { success: false, error: 'No Gmail accounts connected', emails: [] };
    }
    
    // Fetch from the first connected account (or could aggregate from all)
    const account = accounts[0];
    console.log(`Fetching test emails from ${account.email}...`);
    
    // Calculate date for 60 days ago
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateString = sixtyDaysAgo.toISOString().split('T')[0];
    
    // Fetch emails from Gmail
    const fetchResult = await gmailMultiAuth.fetchEmailsFromAccount(account.email, {
      maxResults: 100, // Get more emails for testing
      query: `in:inbox after:${dateString}`
    });
    
    const gmailEmails = [];
    if (fetchResult.messages && fetchResult.messages.length > 0) {
      // Extract email data for UI display
      fetchResult.messages.forEach(message => {
        const headers = message.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        // Extract body
        const emailContent = _extractEmailContent(message);
        
        gmailEmails.push({
          id: message.id,
          subject: subject,
          from: from,
          body: emailContent,
          date: date,
          threadId: message.threadId,
          source: 'gmail'
        });
      });
    }
    
    // Also fetch emails from review queue for testing
    const db = getDb();
    const reviewEmails = db.prepare(`
      SELECT 
        id,
        gmail_message_id,
        subject,
        from_email,
        body_text,
        received_date,
        confidence_score,
        is_job_related,
        company,
        position,
        status
      FROM email_review 
      WHERE manually_reviewed = 0
        AND expires_at > datetime('now')
      ORDER BY confidence_score ASC
      LIMIT 50
    `).all();
    
    // Format review emails to match Gmail email structure
    const formattedReviewEmails = reviewEmails.map(email => ({
      id: email.gmail_message_id,
      subject: email.subject,
      from: email.from_email,
      body: email.body_text,
      date: email.received_date,
      source: 'review',
      reviewId: email.id,
      confidence: email.confidence_score,
      classification: {
        is_job_related: email.is_job_related,
        company: email.company,
        position: email.position,
        status: email.status
      }
    }));
    
    // Combine both sources
    const allEmails = [...gmailEmails, ...formattedReviewEmails];
    
    console.log(`Fetched ${gmailEmails.length} Gmail emails and ${formattedReviewEmails.length} review emails for testing`);
    return { 
      success: true, 
      emails: allEmails,
      stats: {
        gmail: gmailEmails.length,
        review: formattedReviewEmails.length
      }
    };
    
  } catch (error) {
    console.error('Error getting recent emails:', error);
    return { success: false, error: error.message, emails: [] };
  }
});

// Note: ML Classifier handlers are defined earlier in the file

ipcMain.handle('ml:test-email', async (event, emailData) => {
  try {
    // Only use LLM classification now (ML removed)
    const subject = emailData.subject || '';
    const plaintext = emailData.plaintext || emailData.body || emailData.content || '';
    
    const llmResult = await classifier.parse({ 
      subject, 
      plaintext 
    });
    
    return {
      success: true,
      mlResult: null, // ML no longer used
      llmResult,
      recommendation: 'use_llm' // Always use LLM
    };
  } catch (error) {
    console.error('Error testing email:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ml:batch-test', async () => {
  try {
    if (!mlClassifier || !mlClassifier.trained) {
      return { success: false, error: 'ML classifier not ready' };
    }
    
    const db = getDb();
    
    // Get sample of recent emails for testing
    const testEmails = db.prepare(`
      SELECT 
        gmail_message_id,
        subject,
        from_email as from_address,
        body_text as plaintext,
        is_job_related
      FROM email_review
      WHERE manually_reviewed = 1
      LIMIT 100
    `).all();
    
    let mlCorrect = 0;
    let llmCorrect = 0;
    let totalTested = 0;
    
    for (const email of testEmails) {
      const mlResult = mlClassifier.classify(email);
      const actualLabel = email.is_job_related === 1;
      
      if (mlResult.is_job_related === actualLabel) {
        mlCorrect++;
      }
      
      totalTested++;
    }
    
    const mlAccuracy = totalTested > 0 ? mlCorrect / totalTested : 0;
    
    return {
      success: true,
      results: {
        totalTested,
        mlAccuracy,
        mlCorrect,
        averageConfidence: 0.85 // You could calculate this
      }
    };
  } catch (error) {
    console.error('Error in batch test:', error);
    return { success: false, error: error.message };
  }
});

// Get test history
ipcMain.handle('models:get-test-history', async () => {
  try {
    const db = getDb();
    
    // Check if table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='model_test_results'
    `).get();
    
    if (!tableExists) {
      return { success: true, history: [] };
    }
    
    // Get last 10 unique tests
    const tests = db.prepare(`
      SELECT DISTINCT test_id, email_subject, tested_at
      FROM model_test_results
      ORDER BY tested_at DESC
      LIMIT 10
    `).all();
    
    const history = [];
    for (const test of tests) {
      const results = db.prepare(`
        SELECT model_name as modelId, classification_result, processing_time_ms as processingTime, raw_response as rawResponse
        FROM model_test_results
        WHERE test_id = ?
      `).all(test.test_id);
      
      history.push({
        subject: test.email_subject,
        results: results.map(r => ({
          modelId: r.modelId,
          result: JSON.parse(r.classification_result),
          processingTime: r.processingTime,
          rawResponse: r.rawResponse
        })),
        timestamp: test.tested_at
      });
    }
    
    return { success: true, history };
  } catch (error) {
    console.error('Error getting test history:', error);
    return { success: false, error: error.message, history: [] };
  }
});

// Two-Stage LLM Classification Handlers
const twoStage = require('./llm/two-stage-classifier');

// Get prompts for a model
ipcMain.handle('two-stage:get-prompts', async (event, modelId) => {
  try {
    const prompts = twoStage.getModelPrompts(modelId);
    return { success: true, prompts };
  } catch (error) {
    console.error('Error getting prompts:', error);
    return { success: false, error: error.message };
  }
});

// Save Stage 1 prompt
ipcMain.handle('two-stage:save-stage1', async (event, modelId, prompt) => {
  try {
    twoStage.saveStage1Prompt(modelId, prompt);
    return { success: true };
  } catch (error) {
    console.error('Error saving Stage 1 prompt:', error);
    return { success: false, error: error.message };
  }
});

// Save Stage 2 prompt
ipcMain.handle('two-stage:save-stage2', async (event, modelId, prompt) => {
  try {
    twoStage.saveStage2Prompt(modelId, prompt);
    return { success: true };
  } catch (error) {
    console.error('Error saving Stage 2 prompt:', error);
    return { success: false, error: error.message };
  }
});

// Save Stage 3 (job matching) prompt
ipcMain.handle('two-stage:save-stage3', async (event, modelId, prompt) => {
  try {
    twoStage.saveStage3Prompt(modelId, prompt);
    return { success: true };
  } catch (error) {
    console.error('Error saving Stage 3 prompt:', error);
    return { success: false, error: error.message };
  }
});

// Reset prompts to defaults
ipcMain.handle('two-stage:reset-prompts', async (event, modelId) => {
  try {
    twoStage.resetPrompts(modelId);
    return { success: true };
  } catch (error) {
    console.error('Error resetting prompts:', error);
    return { success: false, error: error.message };
  }
});

// Classify email with two-stage approach
ipcMain.handle('two-stage:classify', async (event, modelId, modelPath, emailSubject, emailBody) => {
  try {
    const result = await twoStage.classifyTwoStage(modelId, modelPath, emailSubject, emailBody);
    return { success: true, result };
  } catch (error) {
    console.error('Error in two-stage classification:', error);
    return { success: false, error: error.message };
  }
});

// Test table handlers removed - test tables no longer exist

// ===== HUMAN-IN-THE-LOOP CLASSIFICATION HANDLERS =====

// Classification-only sync (ML only, no LLM parsing)
ipcMain.handle('sync:classify-only', async (event, options = {}) => {
  try {
    const ClassificationOnlyProcessor = require('./processors/classification-only-processor');
    const processor = new ClassificationOnlyProcessor(event.sender);
    
    // Get all connected Gmail accounts
    const gmailAuth = require('./gmail-multi-auth');
    const auth = new gmailAuth();
    const accounts = auth.getAllAccounts();
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No Gmail accounts connected');
    }
    
    // Track sync timing
    const syncStartTime = Date.now();
    
    // Process emails for all accounts
    let totalProcessed = 0;
    let totalClassified = 0;
    let totalJobRelated = 0;
    let totalDigestsFiltered = 0;
    let totalNeedsReview = 0;
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (account.is_active) {
        console.log(`Processing emails for account: ${account.email}`);
        
        // Send progress update with account info
        event.sender.send('sync-progress', {
          stage: `Processing account ${i + 1} of ${accounts.length}: ${account.email}`,
          phase: 'classifying',
          progress: Math.round((i / accounts.length) * 100),
          accountIndex: i + 1,
          totalAccounts: accounts.length,
          currentAccount: account.email
        });
        
        const result = await processor.processEmails(account, options);
        totalProcessed += result.totalEmails || 0;
        totalClassified += result.classified || 0;
        totalJobRelated += result.jobRelated || 0;
        totalDigestsFiltered += result.digestsFiltered || 0;
        totalNeedsReview += result.needsReview || 0;
      }
    }
    
    // Calculate sync duration and rate
    const syncDuration = (Date.now() - syncStartTime) / 1000; // Convert to seconds
    const emailsPerSecond = totalProcessed > 0 ? (totalProcessed / syncDuration).toFixed(1) : 0;
    
    console.log(`Sync completed: ${totalProcessed} emails in ${syncDuration.toFixed(1)}s (${emailsPerSecond} emails/sec)`);
    
    // Send sync complete event with comprehensive stats
    event.sender.send('sync-complete', {
      emailsFetched: totalProcessed,
      emailsClassified: totalClassified,
      jobsFound: totalJobRelated,  // Keep as jobsFound for backward compatibility
      digestsFiltered: totalDigestsFiltered,
      needsReview: totalNeedsReview,
      syncDuration: syncDuration,
      emailsPerSecond: parseFloat(emailsPerSecond),
      success: true
    });
    
    return {
      success: true,
      emailsProcessed: totalProcessed,
      jobsFound: totalClassified
    };
  } catch (error) {
    console.error('Classification-only sync error:', error);
    
    // Send sync error event
    event.sender.send('sync-error', {
      error: error.message,
      details: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Update classification from user review
ipcMain.handle('classification:update', async (event, id, isJobRelated, notes = '') => {
  try {
    const ClassificationOnlyProcessor = require('./processors/classification-only-processor');
    const processor = new ClassificationOnlyProcessor();
    
    const result = await processor.updateClassification(id, isJobRelated, notes);
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Classification update error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Add items to parse queue (mark for LLM parsing)
ipcMain.handle('parse:queue', async (event, items) => {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const { app } = require('electron');
    
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);
    
    try {
      const updateStmt = db.prepare(`
        UPDATE classification_queue 
        SET parse_status = 'pending', updated_at = CURRENT_TIMESTAMP 
        WHERE id IN (${items.map(() => '?').join(',')})
      `);
      
      const result = updateStmt.run(...items);
      
      return {
        success: true,
        updated: result.changes
      };
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Parse queue error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Process parse queue (LLM parsing)
ipcMain.handle('parse:batch', async (event, options = {}) => {
  try {
    const ParseQueueWorker = require('./processors/parse-queue-worker');
    const worker = new ParseQueueWorker(event.sender);
    
    const result = await worker.processParseQueue(options);
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Parse batch error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get items needing review (low confidence classifications)
ipcMain.handle('classification:get-pending', async (event, accountEmail = null) => {
  try {
    const ClassificationOnlyProcessor = require('./processors/classification-only-processor');
    const processor = new ClassificationOnlyProcessor();
    
    const items = await processor.getPendingReview(accountEmail);
    
    return {
      success: true,
      items
    };
  } catch (error) {
    console.error('Get pending review error:', error);
    return {
      success: false,
      error: error.message,
      items: []
    };
  }
});

// Training feedback removed - will export classified data directly instead

// Get parse queue statistics
ipcMain.handle('parse:get-stats', async (event, accountEmail = null) => {
  try {
    const ParseQueueWorker = require('./processors/parse-queue-worker');
    const worker = new ParseQueueWorker();
    
    const stats = await worker.getParseQueueStats(accountEmail);
    
    return {
      success: true,
      stats
    };
  } catch (error) {
    console.error('Parse stats error:', error);
    return {
      success: false,
      error: error.message,
      stats: {
        pending: 0,
        parsing: 0,
        parsed: 0,
        failed: 0,
        skip: 0,
        total: 0
      }
    };
  }
});

// Retry failed parse items
ipcMain.handle('parse:retry-failed', async (event, options = {}) => {
  try {
    const ParseQueueWorker = require('./processors/parse-queue-worker');
    const worker = new ParseQueueWorker(event.sender);
    
    const result = await worker.retryFailedItems(
      options.maxRetries || 50,
      options.modelId || 'llama-3-8b-instruct-q5_k_m'
    );
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Parse retry error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get classification queue summary
ipcMain.handle('classification:get-queue-summary', async (event, accountEmail = null) => {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const { app } = require('electron');
    
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    const db = new Database(dbPath);
    
    try {
      let query = `
        SELECT 
          classification_status,
          parse_status,
          is_job_related,
          needs_review,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
        FROM classification_queue
      `;
      
      const params = [];
      if (accountEmail) {
        query += ' WHERE account_email = ?';
        params.push(accountEmail);
      }
      
      query += ' GROUP BY classification_status, parse_status, is_job_related, needs_review';
      
      const stmt = db.prepare(query);
      const results = stmt.all(...params);
      
      // Calculate summary stats
      const summary = {
        total: 0,
        classified: 0,
        jobRelated: 0,
        needsReview: 0,
        pendingParse: 0,
        parsed: 0,
        failed: 0,
        avgConfidence: 0
      };
      
      let totalConfidence = 0;
      let confidenceCount = 0;
      
      for (const row of results) {
        summary.total += row.count;
        
        if (row.classification_status === 'classified' || row.classification_status === 'reviewed') {
          summary.classified += row.count;
        }
        
        if (row.is_job_related === 1) {
          summary.jobRelated += row.count;
        }
        
        if (row.needs_review === 1) {
          summary.needsReview += row.count;
        }
        
        if (row.parse_status === 'pending' && row.is_job_related === 1) {
          summary.pendingParse += row.count;
        }
        
        if (row.parse_status === 'parsed') {
          summary.parsed += row.count;
        }
        
        if (row.parse_status === 'failed') {
          summary.failed += row.count;
        }
        
        if (row.avg_confidence) {
          totalConfidence += row.avg_confidence * row.count;
          confidenceCount += row.count;
        }
      }
      
      if (confidenceCount > 0) {
        summary.avgConfidence = totalConfidence / confidenceCount;
      }
      
      return {
        success: true,
        summary,
        details: results
      };
      
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Classification queue summary error:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        classified: 0,
        jobRelated: 0,
        needsReview: 0,
        pendingParse: 0,
        parsed: 0,
        failed: 0,
        avgConfidence: 0
      }
    };
  }
});

// Get all classification queue items for review
ipcMain.handle('classification:get-queue', async (event, filters = {}) => {
  try {
    const db = getDb();
    
    let query = `
      SELECT 
        cq.id,
        cq.gmail_message_id as email_id,
        cq.thread_id,
        cq.subject,
        cq.from_address,
        cq.body,
        COALESCE(cq.email_date, cq.created_at) as received_date,
        cq.is_job_related,
        cq.job_probability,
        cq.needs_review,
        cq.user_feedback as user_classification,
        cq.classification_status as review_status,
        cq.company,
        cq.position,
        cq.status,
        cq.created_at,
        cq.updated_at,
        cq.account_email
      FROM classification_queue cq
      WHERE 1=1
    `;
    
    const params = [];
    
    // Apply filters
    if (filters.accountEmail) {
      query += ' AND cq.account_email = ?';
      params.push(filters.accountEmail);
    }
    
    if (filters.needsReview !== undefined) {
      query += ' AND cq.needs_review = ?';
      params.push(filters.needsReview ? 1 : 0);
    }
    
    if (filters.isJobRelated !== undefined) {
      query += ' AND cq.is_job_related = ?';
      params.push(filters.isJobRelated ? 1 : 0);
    }
    
    if (filters.status) {
      query += ' AND cq.classification_status = ?';
      params.push(filters.status);
    }
    
    // Order by date descending
    query += ' ORDER BY cq.created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    
    // Transform results to match frontend expectations
    const emails = results.map(row => ({
      id: row.id,
      email_id: row.email_id,
      thread_id: row.thread_id,
      subject: row.subject || '',
      from_address: row.from_address || '',
      body: row.body || '',
      received_date: row.received_date || new Date().toISOString(),
      account_email: row.account_email || '',
      job_probability: row.job_probability || 0,
      is_job_related: Boolean(row.is_job_related),
      needs_review: Boolean(row.needs_review),
      user_classification: row.user_classification !== null ? Boolean(row.user_classification) : null,
      review_status: row.review_status || 'pending',
      company: row.company || undefined,
      position: row.position || undefined,
      status: row.status || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    // Calculate stats
    const stats = {
      total_emails: emails.length,
      needs_review: emails.filter(e => e.needs_review).length,
      high_confidence_jobs: emails.filter(e => e.job_probability > 0.9).length,
      rejected: emails.filter(e => e.is_job_related === false).length,
      queued_for_parsing: emails.filter(e => e.review_status === 'queued_for_parsing').length,
      avg_confidence: emails.length > 0 
        ? emails.reduce((sum, e) => sum + (e.job_probability || 0), 0) / emails.length 
        : 0
    };
    
    return {
      success: true,
      emails,
      stats
    };
    
  } catch (error) {
    console.error('Error fetching classification queue:', error);
    return {
      success: false,
      error: error.message,
      emails: [],
      stats: {
        total_emails: 0,
        needs_review: 0,
        high_confidence_jobs: 0,
        rejected: 0,
        queued_for_parsing: 0,
        avg_confidence: 0
      }
    };
  }
});

// Export classification data for training
ipcMain.handle('classification:export-training-data', async (event, format = 'json') => {
  try {
    // Minimal logging to avoid EPIPE errors
    
    const db = getDb();
    const fs = require('fs');
    const path = require('path');
    
    // Simplified query matching actual database schema
    const query = `
      SELECT 
        cq.id,
        cq.gmail_message_id,
        cq.thread_id,
        cq.subject,
        cq.from_address,
        cq.body,
        COALESCE(cq.email_date, cq.created_at) as received_date,
        cq.account_email,
        cq.is_job_related as human_classification,
        cq.job_probability as ml_confidence,
        cq.user_feedback,
        cq.needs_review,
        cq.classification_status,
        cq.updated_at as reviewed_at,
        cq.company,
        cq.position,
        cq.status as job_status,
        cq.parse_status,
        cq.raw_email_data
      FROM classification_queue cq
      WHERE cq.subject IS NOT NULL
      ORDER BY cq.created_at DESC
    `;
    
    let rows;
    try {
      rows = db.prepare(query).all();
      // Don't log row count to avoid potential EPIPE errors
    } catch (queryError) {
      console.error('Query error:', queryError);
      return {
        success: false,
        error: `Database query failed: ${queryError.message}`
      };
    }
    
    if (!rows || rows.length === 0) {
      return { 
        success: false, 
        error: 'No classified data available for export' 
      };
    }
    
    // Helper function to calculate ML accuracy
    function calculateAccuracy(rows) {
      const validRows = rows.filter(r => 
        r.ml_confidence !== null && 
        r.human_classification !== null
      );
      
      if (validRows.length === 0) return null;
      
      const correct = validRows.filter(r => {
        const mlPrediction = r.ml_confidence > 0.5 ? 1 : 0;
        return mlPrediction === r.human_classification;
      }).length;
      
      return (correct / validRows.length * 100).toFixed(2);
    }
    
    // Helper function to escape CSV values
    function escapeCSV(value) {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }
    
    // Helper function to convert rows to CSV
    function convertToCSV(rows) {
      if (rows.length === 0) return '';
      
      // Define the columns we want to export
      const columns = [
        'id', 'gmail_message_id', 'thread_id', 'subject', 'from_address',
        'received_date', 'account_email', 'human_classification', 'ml_confidence',
        'user_feedback', 'needs_review', 'classification_status', 'company',
        'position', 'job_status', 'body'
      ];
      
      // Create header row
      const header = columns.join(',');
      
      // Create data rows
      const dataRows = rows.map(row => {
        return columns.map(col => {
          let value = row[col];
          // Convert boolean values to 0/1 for better ML compatibility
          if (col === 'human_classification' || col === 'needs_review') {
            value = value === true ? 1 : value === false ? 0 : '';
          }
          return escapeCSV(value);
        }).join(',');
      });
      
      return [header, ...dataRows].join('\n');
    }
    
    let fileContent;
    let defaultExtension;
    let fileFilter;
    
    if (format === 'csv') {
      fileContent = convertToCSV(rows);
      defaultExtension = 'csv';
      fileFilter = { name: 'CSV Files', extensions: ['csv'] };
    } else {
      // Prepare JSON export data
      const exportData = {
        export_metadata: {
          export_date: new Date().toISOString(),
          export_version: '2.0',
          total_records: rows.length,
          job_related_count: rows.filter(r => r.human_classification === 1).length,
          non_job_count: rows.filter(r => r.human_classification === 0).length,
          uncertain_count: rows.filter(r => r.human_classification === null).length,
          ml_accuracy: calculateAccuracy(rows),
          application_version: '1.0.0',  // Using static version to avoid potential app reference issues
          platform: process.platform
        },
        classifications: rows.map(row => ({
          id: row.id,
          message_id: row.gmail_message_id,
          thread_id: row.thread_id,
          subject: row.subject,
          from_address: row.from_address,
          body_text: row.body,
          received_date: row.received_date,
          account_email: row.account_email,
          human_classification: row.human_classification,
          ml_confidence: row.ml_confidence,
          user_feedback: row.user_feedback,
          needs_review: row.needs_review,
          classification_status: row.classification_status,
          reviewed_at: row.reviewed_at,
          company: row.company,
          position: row.position,
          job_status: row.job_status,
          parse_status: row.parse_status,
          raw_email_data: row.raw_email_data
        }))
      };
      fileContent = JSON.stringify(exportData, null, 2);
      defaultExtension = 'json';
      fileFilter = { name: 'JSON Files', extensions: ['json'] };
    }
    
    // Save dialog for export location
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const downloadsPath = require('os').homedir() + '/Downloads';  // Fallback to user's Downloads folder
    const defaultFileName = `onlyjobs_training_data_${timestamp}.${defaultExtension}`;
    
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(downloadsPath, defaultFileName),
      filters: [
        fileFilter,
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, error: 'Export cancelled' };
    }
    
    // Write the export file
    try {
      await fs.promises.writeFile(
        result.filePath, 
        fileContent,
        'utf8'
      );
      // Success - file written (no console.log to avoid EPIPE)
    } catch (writeError) {
      // Use safer error logging
      try {
        console.error('File write error:', writeError.message);
      } catch (e) {
        // Ignore console errors
      }
      return {
        success: false,
        error: `Failed to write file: ${writeError.message}`
      };
    }
    
    // Optionally mark records as exported (only for classified records)
    try {
      const updateExportStmt = db.prepare(`
        INSERT INTO training_feedback (
          gmail_message_id, subject, body, sender, received_date,
          ml_predicted_label, ml_confidence, human_label,
          exported, exported_at, feature_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(feature_hash) DO UPDATE SET
          exported = 1,
          exported_at = CURRENT_TIMESTAMP
      `);
      
      const updateTransaction = db.transaction((rows) => {
        for (const row of rows) {
          if (row.human_classification !== null) {
            const featureHash = require('crypto')
              .createHash('md5')
              .update(`${row.gmail_message_id}_${row.subject}_${row.from_address}`)
              .digest('hex');
            
            try {
              const mlPrediction = row.ml_confidence > 0.5 ? 1 : 0;
              updateExportStmt.run(
                row.gmail_message_id,
                row.subject,
                row.body?.substring(0, 5000) || '',  // Limit body size
                row.from_address,
                row.received_date,
                mlPrediction,
                row.ml_confidence,
                row.human_classification,
                featureHash
              );
            } catch (insertError) {
              // Silently continue with other records to avoid EPIPE
            }
          }
        }
      });
      
      updateTransaction(rows);
    } catch (updateError) {
      // This is not critical, continue with successful export
      // No console logging to avoid EPIPE
    }
    
    return {
      success: true,
      filePath: result.filePath,
      recordCount: rows.length,
      format: format,
      stats: {
        total_records: rows.length,
        job_related_count: rows.filter(r => r.human_classification === 1).length,
        non_job_count: rows.filter(r => r.human_classification === 0).length,
        uncertain_count: rows.filter(r => r.human_classification === null).length,
        ml_accuracy: calculateAccuracy(rows)
      }
    };
    
  } catch (error) {
    // Safely handle errors without crashing due to console issues
    let errorMessage = 'Unknown error occurred during export';
    try {
      errorMessage = error.message || errorMessage;
      // Only log to console if it's safe
      if (process.stderr && process.stderr.writable) {
        console.error('Export error:', errorMessage);
      }
    } catch (e) {
      // Ignore console errors
    }
    return {
      success: false,
      error: errorMessage
    };
  }
});

// Bulk operation handler for classification review
ipcMain.handle('classification:bulk-operation', async (event, request) => {
  try {
    const db = getDb();
    
    if (!request.email_ids || request.email_ids.length === 0) {
      return { success: false, error: 'No emails provided' };
    }
    
    let updateQuery = '';
    let params = [];
    
    switch (request.operation) {
      case 'approve_as_job':
        updateQuery = `
          UPDATE classification_queue 
          SET classification_status = 'approved',
              is_job_related = 1,
              needs_review = 0,
              user_feedback = 'approved',
              company = COALESCE(?, company),
              position = COALESCE(?, position),
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${request.email_ids.map(() => '?').join(',')})
        `;
        params = [
          request.metadata?.company || null,
          request.metadata?.position || null,
          request.metadata?.status || null,
          ...request.email_ids
        ];
        break;
        
      case 'reject_as_not_job':
        updateQuery = `
          UPDATE classification_queue 
          SET classification_status = 'rejected',
              is_job_related = 0,
              needs_review = 0,
              user_feedback = 'rejected',
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${request.email_ids.map(() => '?').join(',')})
        `;
        params = request.email_ids;
        break;
        
      case 'queue_for_parsing':
        updateQuery = `
          UPDATE classification_queue 
          SET classification_status = 'queued_for_parsing',
              parse_status = 'pending',
              needs_review = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${request.email_ids.map(() => '?').join(',')})
        `;
        params = request.email_ids;
        break;
        
      case 'mark_needs_review':
        updateQuery = `
          UPDATE classification_queue 
          SET needs_review = 1,
              classification_status = 'pending',
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${request.email_ids.map(() => '?').join(',')})
        `;
        params = request.email_ids;
        break;
        
      default:
        return { success: false, error: `Unknown operation: ${request.operation}` };
    }
    
    const stmt = db.prepare(updateQuery);
    const result = stmt.run(...params);
    
    console.log(`Bulk operation ${request.operation} affected ${result.changes} rows`);
    
    return { 
      success: true, 
      changes: result.changes,
      message: `Successfully processed ${result.changes} emails`
    };
    
  } catch (error) {
    console.error('Error in bulk operation:', error);
    return { success: false, error: error.message };
  }
});

// ===== END HUMAN-IN-THE-LOOP HANDLERS =====

// ===== EMAIL PIPELINE HANDLERS =====

// Get pipeline status for emails
ipcMain.handle('get-pipeline-status', async (event, { accountEmail = null, stage = null, limit = 100 }) => {
  try {
    const db = getDb();
    let query = `
      SELECT 
        gmail_message_id,
        thread_id,
        account_email,
        subject,
        from_address,
        email_date,
        pipeline_stage,
        is_digest,
        ml_is_job_related,
        ml_confidence,
        needs_review,
        CASE 
          WHEN extraction_attempts IS NOT NULL 
          THEN json_array_length(extraction_attempts) 
          ELSE 0 
        END as extraction_count,
        selected_model_id,
        jobs_table_id,
        created_at,
        updated_at
      FROM email_pipeline
      WHERE 1=1
    `;
    
    const params = [];
    if (accountEmail) {
      query += ' AND account_email = ?';
      params.push(accountEmail);
    }
    if (stage) {
      query += ' AND pipeline_stage = ?';
      params.push(stage);
    }
    query += ' ORDER BY email_date DESC LIMIT ?';
    params.push(limit);
    
    const results = db.prepare(query).all(...params);
    return { success: true, data: results };
  } catch (error) {
    console.error('Error getting pipeline status:', error);
    return { success: false, error: error.message };
  }
});

// Get extraction comparison for an email
ipcMain.handle('get-extraction-comparison', async (event, { gmailMessageId, accountEmail }) => {
  try {
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    const comparison = await manager.getExtractionComparison(gmailMessageId, accountEmail);
    return { success: true, data: comparison };
  } catch (error) {
    console.error('Error getting extraction comparison:', error);
    return { success: false, error: error.message };
  }
});

// Run extraction with specific model
ipcMain.handle('run-extraction', async (event, { modelId, modelPath, testRunId = null, limit = 100 }) => {
  try {
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    const results = await manager.extractPendingEmails(modelId, modelPath, testRunId, limit);
    return { success: true, data: results };
  } catch (error) {
    console.error('Error running extraction:', error);
    return { success: false, error: error.message };
  }
});

// Select best extraction for an email
ipcMain.handle('select-extraction', async (event, { gmailMessageId, accountEmail, method = 'auto_best' }) => {
  try {
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    const selected = await manager.selectBestExtraction(gmailMessageId, accountEmail, method);
    return { success: true, data: selected };
  } catch (error) {
    console.error('Error selecting extraction:', error);
    return { success: false, error: error.message };
  }
});

// Clear model extractions
ipcMain.handle('clear-model-extractions', async (event, { modelId, testRunId = null }) => {
  try {
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    const cleared = await manager.clearModelExtractions(modelId, testRunId);
    return { success: true, cleared };
  } catch (error) {
    console.error('Error clearing model extractions:', error);
    return { success: false, error: error.message };
  }
});

// Get model performance stats
ipcMain.handle('get-model-performance', async (event, { modelId = null }) => {
  try {
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    const performance = await manager.getModelPerformance(modelId);
    return { success: true, data: performance };
  } catch (error) {
    console.error('Error getting model performance:', error);
    return { success: false, error: error.message };
  }
});

// Create test run
ipcMain.handle('create-test-run', async (event, { description, modelIds, dateFrom, dateTo, settings = {} }) => {
  try {
    const db = getDb();
    const testRunId = `run-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-3)}`;
    
    const stmt = db.prepare(`
      INSERT INTO test_runs (id, description, model_ids, date_from, date_to, settings)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      testRunId,
      description,
      JSON.stringify(modelIds),
      dateFrom,
      dateTo,
      JSON.stringify(settings)
    );
    
    return { success: true, testRunId };
  } catch (error) {
    console.error('Error creating test run:', error);
    return { success: false, error: error.message };
  }
});

// Get test runs
ipcMain.handle('get-test-runs', async (event) => {
  try {
    const db = getDb();
    const runs = db.prepare(`
      SELECT * FROM test_runs 
      ORDER BY created_at DESC
    `).all();
    
    return { success: true, data: runs };
  } catch (error) {
    console.error('Error getting test runs:', error);
    return { success: false, error: error.message };
  }
});

// Delete test run
ipcMain.handle('delete-test-run', async (event, { testRunId }) => {
  try {
    const db = getDb();
    
    // First clear associated extractions
    const ExtractionManager = require('./pipeline/extraction-manager');
    const manager = new ExtractionManager();
    
    // Get all models from the test run
    const testRun = db.prepare('SELECT model_ids FROM test_runs WHERE id = ?').get(testRunId);
    if (testRun && testRun.model_ids) {
      const modelIds = JSON.parse(testRun.model_ids);
      for (const modelId of modelIds) {
        await manager.clearModelExtractions(modelId, testRunId);
      }
    }
    
    // Delete the test run record
    const result = db.prepare('DELETE FROM test_runs WHERE id = ?').run(testRunId);
    
    return { success: true, deleted: result.changes };
  } catch (error) {
    console.error('Error deleting test run:', error);
    return { success: false, error: error.message };
  }
});

// Reset pipeline to stage
ipcMain.handle('reset-pipeline-stage', async (event, { stage, accountEmail = null }) => {
  try {
    const db = getDb();
    let query;
    const params = [];
    
    switch (stage) {
      case 'pre_ml':
        query = `UPDATE email_pipeline SET 
          ml_is_job_related = NULL, 
          ml_confidence = NULL,
          ml_processed_at = NULL,
          ml_processing_time_ms = NULL,
          extraction_attempts = NULL,
          selected_extraction = NULL,
          selected_model_id = NULL,
          pipeline_stage = 'fetched',
          updated_at = CURRENT_TIMESTAMP`;
        break;
        
      case 'pre_extraction':
        query = `UPDATE email_pipeline SET 
          extraction_attempts = NULL,
          selected_extraction = NULL,
          selected_model_id = NULL,
          pipeline_stage = CASE 
            WHEN ml_is_job_related = 1 THEN 'extraction_pending'
            WHEN ml_is_job_related = 0 THEN 'ml_classified'
            ELSE pipeline_stage
          END,
          updated_at = CURRENT_TIMESTAMP`;
        break;
        
      case 'pre_promotion':
        query = `UPDATE email_pipeline SET 
          jobs_table_id = NULL,
          pipeline_stage = CASE
            WHEN selected_extraction IS NOT NULL THEN 'extraction_complete'
            WHEN ml_is_job_related = 1 THEN 'extraction_pending'
            ELSE pipeline_stage
          END,
          updated_at = CURRENT_TIMESTAMP
          WHERE pipeline_stage = 'promoted_to_jobs'`;
        break;
        
      default:
        throw new Error('Invalid stage: ' + stage);
    }
    
    if (accountEmail) {
      query += ' WHERE account_email = ?';
      params.push(accountEmail);
    }
    
    const result = db.prepare(query).run(...params);
    
    return { success: true, updated: result.changes };
  } catch (error) {
    console.error('Error resetting pipeline stage:', error);
    return { success: false, error: error.message };
  }
});

// ===== END EMAIL PIPELINE HANDLERS =====

// Cleanup on app quit
app.on('before-quit', () => {
  if (db) {
    db.close();
  }
  if (gmailMultiAuth && gmailMultiAuth.db) {
    gmailMultiAuth.db.close();
  }
  // Clean up two-stage classifier
  twoStage.cleanup();
});

console.log('IPC handlers loaded successfully');
