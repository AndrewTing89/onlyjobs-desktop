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

// Removed old auth-flow - using simplified auth for desktop app
// const GmailAuth = require('./gmail-auth'); // Removed - using multi-account only
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
// LLM Health Check
ipcMain.handle('llm:health-check', async () => {
  try {
    const llmEngine = require('./llm/llmEngine');
    const health = await llmEngine.checkLLMHealth();
    return health;
  } catch (error) {
    console.error('Health check error:', error);
    return {
      status: 'error',
      error: error.message,
      modelExists: false,
      canLoad: false
    };
  }
});

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

// Multi-account sync
ipcMain.handle('gmail:sync-all', async (event, options = {}) => {
  const syncStartTime = Date.now();
  console.log('🔄 SYNC: Starting sync process...');
  
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
    
    console.log(`Starting sync for ${accounts.length} accounts...`);
    const { daysToSync = 90, maxEmails = 500 } = options;
    console.log(`Sync options - daysToSync: ${daysToSync}, maxEmails: ${maxEmails}`);
    
    let totalEmailsFetched = 0;
    let totalEmailsClassified = 0;
    let totalJobsFound = 0;
    let totalEmailsSkipped = 0;
    
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
        
        if (!fetchResult.messages || fetchResult.messages.length === 0) {
          console.log(`No messages found for ${account.email}`);
          continue;
        }
        
        // Process each email directly
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
            status: `Processing emails from ${account.email}`,
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
            
            // Classify with LLM
            const classification = await llmHandler.classifyEmail(emailContent);
            
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
                details: `✅ Job found: ${classification.company || 'Unknown Company'} - ${classification.position || 'Unknown Position'}`
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
            
            // If job-related, create or update job entry
            if (classification.is_job_related) {
              // Create similarity key for deduplication
              const company = classification.company || 'Unknown';
              const position = classification.position || 'Unknown Position';
              const similarityKey = `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}_${position.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
              
              // Check for existing similar job within 30 days
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              
              const existingJobStmt = getDb().prepare(`
                SELECT id, status, email_history 
                FROM jobs 
                WHERE similarity_key = ? 
                  AND account_email = ?
                  AND applied_date > ?
                ORDER BY applied_date DESC
                LIMIT 1
              `);
              
              const existingJob = existingJobStmt.get(similarityKey, account.email, thirtyDaysAgo.toISOString());
              
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
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count
    };
    console.log('📊 Current record counts:', beforeCounts);
    
    // Use a transaction to ensure all operations succeed or fail together
    const clearAll = db.transaction(() => {
      // Clear all tables in the correct order (respecting foreign key constraints if any)
      const clearEmailSync = db.prepare('DELETE FROM email_sync');
      const clearJobs = db.prepare('DELETE FROM jobs');
      const clearGmailAccounts = db.prepare('DELETE FROM gmail_accounts');
      const resetSyncStatus = db.prepare('UPDATE sync_status SET last_fetch_time = NULL, last_classify_time = NULL, last_sync_status = NULL, total_emails_fetched = 0, total_emails_classified = 0, total_jobs_found = 0 WHERE id = 1');
      
      const emailSyncResult = clearEmailSync.run();
      console.log(`Deleted ${emailSyncResult.changes} email_sync records`);
      
      const jobsResult = clearJobs.run();
      console.log(`Deleted ${jobsResult.changes} jobs records`);
      
      const gmailAccountsResult = clearGmailAccounts.run();
      console.log(`Deleted ${gmailAccountsResult.changes} gmail_accounts records`);
      
      resetSyncStatus.run();
      console.log('Reset sync status');
      
      return {
        emailSyncDeleted: emailSyncResult.changes,
        jobsDeleted: jobsResult.changes,
        gmailAccountsDeleted: gmailAccountsResult.changes
      };
    });
    
    const result = clearAll();
    
    // Verify the deletion
    const afterCounts = {
      emailSync: db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count,
      jobs: db.prepare('SELECT COUNT(*) as count FROM jobs').get().count,
      gmailAccounts: db.prepare('SELECT COUNT(*) as count FROM gmail_accounts').get().count
    };
    console.log('📊 After clearing - record counts:', afterCounts);
    
    console.log('✅ Database cleared successfully:', result);
    
    return {
      success: true,
      message: `All database records have been cleared successfully. Deleted: ${result.emailSyncDeleted} email sync records, ${result.jobsDeleted} jobs, ${result.gmailAccountsDeleted} accounts`,
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
    console.log('🗑️ Clearing email sync history...');
    
    const db = getDb();
    
    // Check current count before clearing
    const beforeCount = db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count;
    console.log(`📊 Current email_sync records: ${beforeCount}`);
    
    const stmt = db.prepare('DELETE FROM email_sync');
    const result = stmt.run();
    console.log(`Deleted ${result.changes} email_sync records`);
    
    // Reset sync status counters
    const resetStmt = db.prepare('UPDATE sync_status SET total_emails_fetched = 0, total_emails_classified = 0, last_sync_status = NULL WHERE id = 1');
    resetStmt.run();
    console.log('Reset sync status counters');
    
    // Verify the deletion
    const afterCount = db.prepare('SELECT COUNT(*) as count FROM email_sync').get().count;
    console.log(`📊 After clearing - email_sync records: ${afterCount}`);
    
    console.log(`✅ Cleared ${result.changes} email sync records`);
    
    return {
      success: true,
      message: `Email sync history cleared successfully (${result.changes} records deleted)`,
      recordsDeleted: result.changes
    };
  } catch (error) {
    console.error('❌ Error clearing email sync history:', error);
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
  return await promptManager.getPrompt();
});

ipcMain.handle('prompt:set', async (event, prompt) => {
  return await promptManager.setPrompt(prompt);
});

ipcMain.handle('prompt:reset', async () => {
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
