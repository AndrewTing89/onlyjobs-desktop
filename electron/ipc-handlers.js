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

// LLM-only classification handler (no ML, no keyword fallback)
const llmHandler = {
  classifyEmail: async (content) => {
    console.log('🧠 Using LLM classifier only');
    try {
      // Parse content to extract subject and body
      const lines = content.split('\n');
      const subjectLine = lines.find(line => line.toLowerCase().startsWith('subject:'));
      const subject = subjectLine ? subjectLine.substring(8).trim() : '';
      
      const result = await classifier.parse({ subject, plaintext: content });
      console.log('LLM classification result:', result);
      
      // Map status to job_type for backward compatibility
      let jobType = null;
      if (result.is_job_related && result.status) {
        const status = result.status.toLowerCase();
        if (status.includes('interview')) jobType = 'interview';
        else if (status.includes('offer')) jobType = 'offer';
        else if (status.includes('declined') || status.includes('reject')) jobType = 'rejection';
        else if (status.includes('applied')) jobType = 'application_sent';
        else jobType = 'application_sent';
      }
      
      return {
        ...result,
        job_type: jobType
      };
    } catch (error) {
      console.error('LLM classification error:', error);
      // Return non-job-related as safe fallback
      return {
        is_job_related: false,
        company: null,
        position: null,
        status: null,
        job_type: null
      };
    }
  },
  initialize: async () => {
    console.log('🧠 LLM handler initialized');
    return true;
  },
  isModelReady: async () => true,
  getModelStatus: async () => ({ 
    status: 'Using local LLM model',
    model_ready: true 
  }),
  trainModel: async () => {
    throw new Error('Training not available for LLM');
  }
};

const ElectronAuthFlow = require('./auth-flow');
const GmailAuth = require('./gmail-auth');
const GmailMultiAuth = require('./gmail-multi-auth');
const IntegratedEmailProcessor = require('./integrated-email-processor');

console.log('Loading IPC handlers...');

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
function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    db = new Database(dbPath);
    if (!initialized) {
      initializeDatabase();
      initialized = true;
    }
  }
  return db;
}

// Initialize database schema
function initializeDatabase() {
  // Disable foreign keys during migration
  getDb().pragma('foreign_keys = OFF');
  
  try {
    // First, check if jobs table exists and needs migration
    const jobsTableExists = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get();
    
    if (jobsTableExists) {
      // Check if jobs table needs migration to new schema
      const jobsTableInfo = getDb().prepare("PRAGMA table_info(jobs)").all();
      const hasGmailMessageId = jobsTableInfo.some(col => col.name === 'gmail_message_id');
      const hasAccountEmail = jobsTableInfo.some(col => col.name === 'account_email');
      const hasFromAddress = jobsTableInfo.some(col => col.name === 'from_address');
      
      console.log('Jobs table columns check:', {
        hasGmailMessageId,
        hasAccountEmail,
        hasFromAddress,
        currentColumns: jobsTableInfo.map(col => col.name)
      });
      
      // Add missing columns individually rather than recreating the entire table
      if (!hasGmailMessageId) {
        console.log('Adding gmail_message_id column to jobs table...');
        getDb().exec('ALTER TABLE jobs ADD COLUMN gmail_message_id TEXT');
        // Update existing records with a default value
        getDb().exec("UPDATE jobs SET gmail_message_id = 'migrated_' || id WHERE gmail_message_id IS NULL");
      }
      
      if (!hasAccountEmail) {
        console.log('Adding account_email column to jobs table...');
        getDb().exec('ALTER TABLE jobs ADD COLUMN account_email TEXT');
        // Update existing records with a default value
        getDb().exec("UPDATE jobs SET account_email = 'unknown@migrated.com' WHERE account_email IS NULL");
      }
      
      if (!hasFromAddress) {
        console.log('Adding from_address column to jobs table...');
        getDb().exec('ALTER TABLE jobs ADD COLUMN from_address TEXT');
        // Update existing records with a default value
        getDb().exec("UPDATE jobs SET from_address = 'migrated' WHERE from_address IS NULL");
      }
      
      // Also check if status values need normalization
      const statusNormalizationNeeded = getDb().prepare(`
        SELECT COUNT(*) as count FROM jobs 
        WHERE status NOT IN ('Applied', 'Interviewed', 'Declined', 'Offer')
      `).get();
      
      if (statusNormalizationNeeded.count > 0) {
        console.log('Normalizing job status values...');
        getDb().exec(`
          UPDATE jobs SET status = CASE 
            WHEN status = 'active' THEN 'Applied'
            WHEN status = 'applied' THEN 'Applied'
            WHEN status = 'interviewing' THEN 'Interviewed'
            WHEN status = 'offered' THEN 'Offer'
            WHEN status = 'rejected' THEN 'Declined'
            WHEN status = 'withdrawn' THEN 'Declined'
            ELSE 'Applied'
          END
          WHERE status NOT IN ('Applied', 'Interviewed', 'Declined', 'Offer')
        `);
      }
    }
    
    // Check if email_sync table exists and needs migration
    const emailSyncTableExists = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_sync'").get();
    
    if (emailSyncTableExists) {
      // Check if email_sync table has the account_email column
      const emailSyncTableInfo = getDb().prepare("PRAGMA table_info(email_sync)").all();
      const hasAccountEmail = emailSyncTableInfo.some(col => col.name === 'account_email');
      
      if (!hasAccountEmail) {
        console.log('Migrating email_sync table to new schema...');
        
        // Create new email_sync table with correct schema
        getDb().exec(`
          CREATE TABLE IF NOT EXISTS email_sync_new (
            gmail_message_id TEXT,
            account_email TEXT NOT NULL,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_job_related BOOLEAN DEFAULT 0,
            PRIMARY KEY (gmail_message_id, account_email)
          );
        `);
        
        // Copy existing data from old table with default account_email
        getDb().exec(`
          INSERT INTO email_sync_new (gmail_message_id, account_email, processed_at, is_job_related)
          SELECT 
            gmail_message_id,
            'migrated@unknown.com' as account_email,
            processed_at,
            is_job_related
          FROM email_sync;
        `);
        
        // Drop old table and rename new one
        getDb().exec('DROP TABLE email_sync');
        getDb().exec('ALTER TABLE email_sync_new RENAME TO email_sync');
        
        console.log('Migration completed: Updated email_sync table schema');
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

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_gmail_id ON jobs(gmail_message_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_email);
    CREATE INDEX IF NOT EXISTS idx_email_sync_account ON email_sync(account_email);

    -- Initialize sync status if not exists
    INSERT OR IGNORE INTO sync_status (id) VALUES (1);
  `);
  
  // Re-enable foreign keys
  getDb().pragma('foreign_keys = ON');
}

// Database operations
ipcMain.handle('db:get-jobs', async (event, filters = {}) => {
  try {
    // First verify that the jobs table has all required columns
    const tableInfo = getDb().prepare("PRAGMA table_info(jobs)").all();
    const columnNames = tableInfo.map(col => col.name);
    const requiredColumns = ['id', 'company', 'position', 'status', 'applied_date', 'account_email', 'gmail_message_id', 'from_address'];
    
    console.log('Jobs table current columns:', columnNames);
    
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    if (missingColumns.length > 0) {
      console.error('Missing required columns in jobs table:', missingColumns);
      throw new Error(`Missing required columns in jobs table: ${missingColumns.join(', ')}`);
    }
    
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
    if (results.length > 0) {
      console.log('Sample job from database:', results[0]); // Debug first job
    }
    
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

ipcMain.handle('db:create-job', async (event, job) => {
  try {
    const id = job.id || `job_${Date.now()}_${performance.now().toString().replace('.', '_')}_${Math.random().toString(36).substr(2, 9)}`;
    
    // For manual job creation, we need to handle the case where there's no gmail_message_id
    const gmail_message_id = job.gmail_message_id || `manual_${id}`;
    const account_email = job.account_email || 'manual@onlyjobs.com';
    const from_address = job.from_address || 'Manual Entry';
    
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO jobs (id, gmail_message_id, company, position, status, applied_date, location, salary_range, notes, ml_confidence, account_email, from_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      id,
      gmail_message_id,
      job.company,
      job.position,
      job.status || 'Applied',
      job.applied_date || new Date().toISOString().split('T')[0],
      job.location,
      job.salary_range,
      job.notes,
      job.ml_confidence || null,
      account_email,
      from_address
    );

    const createdJob = {
      id,
      gmail_message_id,
      company: job.company,
      position: job.position,
      status: job.status || 'Applied',
      applied_date: job.applied_date || new Date().toISOString().split('T')[0],
      location: job.location,
      salary_range: job.salary_range,
      notes: job.notes,
      ml_confidence: job.ml_confidence || null,
      account_email,
      from_address,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      changes: result.changes
    };

    return createdJob;
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

// Enhanced job editing handler with validation
ipcMain.handle('db:edit-job', async (event, id, updates) => {
  try {
    // Validate that we don't allow editing time fields
    const restrictedFields = ['created_at', 'updated_at', 'applied_date'];
    const allowedFields = Object.keys(updates).filter(key => !restrictedFields.includes(key));
    
    if (allowedFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    const fields = allowedFields.map(key => `${key} = ?`).join(', ');
    const values = allowedFields.map(key => updates[key]);
    values.push(id);

    const stmt = getDb().prepare(`
      UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    
    // Return the updated job record
    if (result.changes > 0) {
      const getUpdatedJob = getDb().prepare('SELECT * FROM jobs WHERE id = ?');
      const updatedJob = getUpdatedJob.get(id);
      return { success: true, job: updatedJob, changes: result.changes };
    }
    
    return { success: false, message: 'Job not found or no changes made' };
  } catch (error) {
    console.error('Error editing job:', error);
    throw error;
  }
});

// Manual job creation handler with better defaults and validation
ipcMain.handle('db:create-manual-job', async (event, jobData) => {
  try {
    // Validate required fields
    if (!jobData.company || !jobData.position) {
      throw new Error('Company and position are required fields');
    }
    
    // Validate status
    const validStatuses = ['Applied', 'Interviewed', 'Declined', 'Offer'];
    if (jobData.status && !validStatuses.includes(jobData.status)) {
      throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
    }
    
    const id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gmail_message_id = `manual_${id}`;
    const currentDate = new Date().toISOString().split('T')[0];
    
    const stmt = getDb().prepare(`
      INSERT INTO jobs (id, gmail_message_id, company, position, status, applied_date, location, salary_range, notes, ml_confidence, account_email, from_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      id,
      gmail_message_id,
      jobData.company.trim(),
      jobData.position.trim(),
      jobData.status || 'Applied',
      jobData.applied_date || currentDate,
      jobData.location?.trim() || null,
      jobData.salary_range?.trim() || null,
      jobData.notes?.trim() || null,
      null, // ml_confidence is null for manual entries
      'manual@onlyjobs.com',
      'Manual Entry'
    );

    if (result.changes > 0) {
      const createdJob = {
        id,
        gmail_message_id,
        company: jobData.company.trim(),
        position: jobData.position.trim(),
        status: jobData.status || 'Applied',
        applied_date: jobData.applied_date || currentDate,
        location: jobData.location?.trim() || null,
        salary_range: jobData.salary_range?.trim() || null,
        notes: jobData.notes?.trim() || null,
        ml_confidence: null,
        account_email: 'manual@onlyjobs.com',
        from_address: 'Manual Entry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      return { success: true, job: createdJob };
    }
    
    throw new Error('Failed to create job record');
  } catch (error) {
    console.error('Error creating manual job:', error);
    throw error;
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
ipcMain.handle('ml:get-status', async () => {
  try {
    const status = await llmHandler.getModelStatus();
    return status;
  } catch (error) {
    console.error('Error getting ML model status:', error);
    throw error;
  }
});

ipcMain.handle('ml:is-ready', async () => {
  try {
    const isReady = await llmHandler.isModelReady();
    return { ready: isReady };
  } catch (error) {
    console.error('Error checking ML model readiness:', error);
    return { ready: false, error: error.message };
  }
});

ipcMain.handle('ml:train-model', async (event, options = {}) => {
  try {
    console.log('🏋️  Starting ML model training...');
    const result = await llmHandler.trainModel(options);
    
    // Notify frontend of training completion
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('ml-training-complete', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ ML model training failed:', error);
    
    // Notify frontend of training error
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('ml-training-error', { error: error.message });
    }
    
    throw error;
  }
});

ipcMain.handle('ml:initialize', async () => {
  try {
    const result = await llmHandler.initialize();
    return { success: result };
  } catch (error) {
    console.error('Error initializing ML handler:', error);
    return { success: false, error: error.message };
  }
});

// Initialize auth flow
const authFlow = new ElectronAuthFlow();

// Initialize Gmail auth (legacy single account)
let gmailAuth;
try {
  gmailAuth = new GmailAuth();
  console.log('Gmail auth initialized successfully');
} catch (error) {
  console.error('Failed to initialize Gmail auth:', error);
}

// Initialize multi-account Gmail auth
let gmailMultiAuth;
try {
  gmailMultiAuth = new GmailMultiAuth();
  console.log('Gmail multi-auth initialized successfully');
} catch (error) {
  console.error('Failed to initialize Gmail multi-auth:', error);
  console.error('Full error details:', error.stack);
  // Don't set gmailMultiAuth to prevent undefined errors
}

// Listen for Gmail auth events
if (gmailAuth) {
  gmailAuth.on('authenticated', (tokens) => {
    console.log('Gmail authenticated event received');
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('gmail-authenticated', tokens);
    }
  });
}

// Listen for auth events
authFlow.on('auth-success', (data) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('auth-success', data);
  }
});

authFlow.on('auth-error', (error) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('auth-error', error.message);
  }
});

// Authentication operations
ipcMain.handle('auth:sign-in', async () => {
  console.log('IPC: auth:sign-in called');
  try {
    await authFlow.signIn();
    return { success: true };
  } catch (error) {
    console.error('IPC: Sign in error:', error);
    throw error;
  }
});

ipcMain.handle('auth:sign-out', async () => {
  try {
    await authFlow.signOut();
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
});

ipcMain.handle('auth:get-tokens', async () => {
  try {
    const tokens = authFlow.getStoredTokens();
    return { success: true, tokens };
  } catch (error) {
    console.error('Get tokens error:', error);
    throw error;
  }
});

ipcMain.handle('auth:is-authenticated', async () => {
  try {
    const isAuth = authFlow.isAuthenticated();
    return { success: true, authenticated: isAuth };
  } catch (error) {
    console.error('Auth check error:', error);
    throw error;
  }
});

// Gmail authentication
ipcMain.handle('gmail:authenticate', async () => {
  try {
    console.log('IPC: gmail:authenticate called');
    
    // Check if we're in the correct environment
    if (!gmailAuth) {
      console.error('Gmail auth not initialized!');
      throw new Error('Gmail authentication not initialized');
    }
    
    const tokens = await gmailAuth.authenticate();
    console.log('IPC: Gmail auth successful');
    return { success: true, tokens };
  } catch (error) {
    console.error('IPC: Gmail auth error:', error);
    throw error;
  }
});

// Get Gmail authentication status
ipcMain.handle('gmail:get-auth-status', async () => {
  try {
    const isAuthenticated = gmailAuth.isAuthenticated();
    const tokens = gmailAuth.getStoredTokens();
    return { 
      success: true, 
      authenticated: isAuthenticated,
      hasTokens: !!tokens
    };
  } catch (error) {
    console.error('Error getting Gmail auth status:', error);
    throw error;
  }
});

// Fetch Gmail emails
ipcMain.handle('gmail:fetch-emails', async (event, options = {}) => {
  try {
    console.log('IPC: gmail:fetch-emails called with options:', options);
    const result = await gmailAuth.fetchEmails(options);
    return { success: true, ...result };
  } catch (error) {
    console.error('IPC: Error fetching emails:', error);
    throw error;
  }
});

// Disconnect Gmail
ipcMain.handle('gmail:disconnect', async () => {
  try {
    await gmailAuth.disconnect();
    return { success: true };
  } catch (error) {
    console.error('Error disconnecting Gmail:', error);
    throw error;
  }
});

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
    
    if (!gmailMultiAuth) {
      console.error('GmailMultiAuth is not initialized!');
      // Try to initialize it now
      try {
        const GmailMultiAuth = require('./gmail-multi-auth');
        gmailMultiAuth = new GmailMultiAuth();
        console.log('GmailMultiAuth initialized on demand');
      } catch (initError) {
        console.error('Failed to initialize GmailMultiAuth:', initError);
        throw new Error('Gmail multi-account support not available. Please check the logs.');
      }
    }
    
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
    gmailMultiAuth.removeAccount(email);
    return { success: true };
  } catch (error) {
    console.error('Error removing Gmail account:', error);
    throw error;
  }
});

// Multi-account sync
ipcMain.handle('gmail:sync-all', async (event, options = {}) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const accounts = gmailMultiAuth.getAllAccounts();
    
    if (accounts.length === 0) {
      return {
        success: false,
        message: 'No Gmail accounts connected'
      };
    }
    
    console.log(`Starting sync for ${accounts.length} accounts...`);
    const { daysToSync = 90, maxEmails = 500 } = options;
    console.log(`Sync options - daysToSync: ${daysToSync}, maxEmails: ${maxEmails}`);
    
    let totalEmailsFetched = 0;
    let totalEmailsClassified = 0;
    let totalJobsFound = 0;
    
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
      const account = accounts[i];
      
      mainWindow.webContents.send('sync-progress', {
        current: i,
        total: accounts.length,
        status: `Fetching emails from ${account.email}...`,
        account: account.email
      });
      
      try {
        // Fetch emails from this account
        const fetchResult = await gmailMultiAuth.fetchEmailsFromAccount(account.email, {
          maxResults: maxEmails,
          query: `in:inbox newer_than:${daysToSync}d`
        });
        
        if (!fetchResult.messages || fetchResult.messages.length === 0) {
          continue;
        }
        
        // Process each email directly
        for (const email of fetchResult.messages) {
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
              continue;
            }
            
            // Extract email info for classification
            const headers = email.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const emailContent = _extractEmailContent(email);
            
            // Classify with LLM
            const classification = await llmHandler.classifyEmail(emailContent);
            
            // Update the record with classification result
            const updateSyncStmt = getDb().prepare(`
              UPDATE email_sync 
              SET is_job_related = ?
              WHERE gmail_message_id = ? AND account_email = ?
            `);
            updateSyncStmt.run(classification.is_job_related ? 1 : 0, email.id, account.email);
            
            totalEmailsFetched++;
            
            // If job-related, create job entry
            if (classification.is_job_related) {
              const jobId = `job_${Date.now()}_${performance.now().toString().replace('.', '_')}_${Math.random().toString(36).substr(2, 9)}`;
              const jobStmt = getDb().prepare(`
                INSERT OR IGNORE INTO jobs (id, gmail_message_id, company, position, status, applied_date, account_email, from_address, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              
              const jobResult = jobStmt.run(
                jobId,
                email.id,
                classification.company || _extractCompany(emailContent),
                classification.position || _extractPosition(emailContent),
                status,
                extractedDate,
                account.email,
                from,
                email.snippet || ''
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
          } catch (error) {
            console.error(`Error processing email ${email.id}:`, error);
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
    
    mainWindow.webContents.send('sync-complete', {
      emailsFetched: totalEmailsFetched,
      emailsClassified: totalEmailsClassified,
      jobsFound: totalJobsFound,
      accounts: accounts.length
    });
    
    return {
      success: true,
      emailsFetched: totalEmailsFetched,
      emailsClassified: totalEmailsClassified,
      jobsFound: totalJobsFound,
      accounts: accounts.length
    };
  } catch (error) {
    console.error('Multi-account sync error:', error);
    throw error;
  }
});

// Database management operations
ipcMain.handle('db:clear-all-records', async () => {
  try {
    console.log('🗑️ Clearing all database records...');
    
    // Use a transaction to ensure all operations succeed or fail together
    const clearAll = getDb().transaction(() => {
      // Clear all tables in the correct order (respecting foreign key constraints if any)
      const clearEmailSync = getDb().prepare('DELETE FROM email_sync');
      const clearJobs = getDb().prepare('DELETE FROM jobs');
      const clearGmailAccounts = getDb().prepare('DELETE FROM gmail_accounts');
      const resetSyncStatus = getDb().prepare('UPDATE sync_status SET last_fetch_time = NULL, last_classify_time = NULL, last_sync_status = NULL, total_emails_fetched = 0, total_emails_classified = 0, total_jobs_found = 0 WHERE id = 1');
      
      const emailSyncResult = clearEmailSync.run();
      const jobsResult = clearJobs.run();
      const gmailAccountsResult = clearGmailAccounts.run();
      resetSyncStatus.run();
      
      return {
        emailSyncDeleted: emailSyncResult.changes,
        jobsDeleted: jobsResult.changes,
        gmailAccountsDeleted: gmailAccountsResult.changes
      };
    });
    
    const result = clearAll();
    
    console.log('✅ Database cleared successfully:', result);
    
    return {
      success: true,
      message: 'All database records have been cleared successfully',
      details: result
    };
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  }
});

ipcMain.handle('db:clear-email-sync', async () => {
  try {
    console.log('🗑️ Clearing email sync history...');
    
    const stmt = getDb().prepare('DELETE FROM email_sync');
    const result = stmt.run();
    
    // Reset sync status counters
    const resetStmt = getDb().prepare('UPDATE sync_status SET total_emails_fetched = 0, total_emails_classified = 0, last_sync_status = NULL WHERE id = 1');
    resetStmt.run();
    
    console.log(`✅ Cleared ${result.changes} email sync records`);
    
    return {
      success: true,
      message: `Email sync history cleared successfully (${result.changes} records deleted)`,
      recordsDeleted: result.changes
    };
  } catch (error) {
    console.error('❌ Error clearing email sync history:', error);
    throw error;
  }
});

// Cleanup on app quit
app.on('before-quit', () => {
  if (db) {
    db.close();
  }
  if (gmailMultiAuth && gmailMultiAuth.db) {
    gmailMultiAuth.db.close();
  }
});

console.log('IPC handlers loaded successfully');
