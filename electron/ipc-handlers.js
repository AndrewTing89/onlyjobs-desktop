const { ipcMain, dialog, shell, Notification, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');
const Store = require('electron-store').default || require('electron-store');
const { app } = require('electron');
const { spawn } = require('child_process');
const { convert } = require('html-to-text');
const mlHandler = {
  classifyEmail: async (content) => {
    return new Promise((resolve) => {
      console.log('Using Python ML classifier');
      
      const scriptPath = path.join(__dirname, '..', 'ml-classifier', 'scripts', 'classify_email_simple.py');
      
      // Spawn Python process from the main directory
      const python = spawn('python3', [
        scriptPath,
        '--text', content,
        '--format', 'json'
      ]);
      
      let output = '';
      let error = '';
      
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          console.error('ML classifier error:', error);
          // Fallback to keyword classifier
          resolve(fallbackClassifier(content));
        } else {
          try {
            const result = JSON.parse(output);
            console.log('ML classification result:', result);
            
            // Extract job type if job-related
            let jobType = null;
            if (result.is_job_related) {
              const lowerContent = content.toLowerCase();
              if (lowerContent.includes('interview')) jobType = 'interview';
              else if (lowerContent.includes('offer')) jobType = 'offer';
              else if (lowerContent.includes('reject') || lowerContent.includes('unfortunately')) jobType = 'rejection';
              else if (lowerContent.includes('follow up')) jobType = 'follow_up';
              else jobType = 'application_sent';
            }
            
            resolve({
              ...result,
              job_type: jobType
            });
          } catch (e) {
            console.error('Failed to parse ML output:', e);
            resolve(fallbackClassifier(content));
          }
        }
      });
      
      python.on('error', (err) => {
        console.error('Failed to start Python:', err);
        resolve(fallbackClassifier(content));
      });
    });
  },
  initialize: async () => {
    console.log('ML handler initialized');
    return true;
  },
  isModelReady: async () => true,
  getModelStatus: async () => ({ 
    status: 'Using Python ML model',
    model_ready: true 
  }),
  trainModel: async () => {
    throw new Error('Training not implemented');
  }
};

// Fallback keyword-based classifier
function fallbackClassifier(content) {
  console.log('Using fallback keyword classifier');
  const lowerContent = content.toLowerCase();
  
  const jobKeywords = [
    'interview', 'position', 'application', 'job', 'offer', 'salary',
    'career', 'opportunity', 'hiring', 'recruitment', 'candidate',
    'resume', 'cv', 'applied', 'recruiter', 'hr', 'role', 'opening'
  ];
  
  const nonJobKeywords = [
    'unsubscribe', 'newsletter', 'promotion', 'sale', 'discount',
    'invoice', 'receipt', 'order', 'shipping', 'password', 'verify'
  ];
  
  let jobScore = 0;
  let nonJobScore = 0;
  
  jobKeywords.forEach(keyword => {
    if (lowerContent.includes(keyword)) jobScore++;
  });
  
  nonJobKeywords.forEach(keyword => {
    if (lowerContent.includes(keyword)) nonJobScore++;
  });
  
  const isJobRelated = jobScore > 0 && jobScore >= nonJobScore;
  const confidence = jobScore > 0 ? Math.min(0.9, 0.5 + (jobScore * 0.1)) : 0.3;
  
  let jobType = 'application_sent';
  if (lowerContent.includes('interview')) jobType = 'interview';
  else if (lowerContent.includes('offer')) jobType = 'offer';
  else if (lowerContent.includes('reject') || lowerContent.includes('unfortunately')) jobType = 'rejection';
  else if (lowerContent.includes('follow up')) jobType = 'follow_up';
  
  return {
    is_job_related: isJobRelated,
    confidence: confidence,
    job_type: isJobRelated ? jobType : null,
    fallback: true
  };
}
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
function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    db = new Database(dbPath);
    initializeDatabase();
  }
  return db;
}

// Initialize database schema
function initializeDatabase() {
  getDb().exec(`
    -- Raw emails table (new)
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT UNIQUE NOT NULL,
      subject TEXT,
      from_address TEXT,
      to_address TEXT,
      date DATE,
      snippet TEXT,
      raw_content TEXT,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Classification fields
      is_classified BOOLEAN DEFAULT 0,
      is_job_related BOOLEAN,
      job_type TEXT,
      ml_confidence REAL,
      classification_method TEXT,
      classified_at TIMESTAMP,
      
      -- Extracted data
      company_extracted TEXT,
      position_extracted TEXT
    );

    -- Jobs table (refined)
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      email_id TEXT REFERENCES emails(id),
      company TEXT NOT NULL,
      position TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn')),
      job_type TEXT CHECK(job_type IN ('application_sent', 'interview', 'offer', 'rejection', 'follow_up')),
      applied_date DATE,
      location TEXT,
      salary_range TEXT,
      notes TEXT,
      ml_confidence REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    CREATE INDEX IF NOT EXISTS idx_emails_classified ON emails(is_classified);
    CREATE INDEX IF NOT EXISTS idx_emails_job_related ON emails(is_job_related);
    CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
    CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_message_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_email_id ON jobs(email_id);

    -- Initialize sync status if not exists
    INSERT OR IGNORE INTO sync_status (id) VALUES (1);
    
    -- Migrate existing data if needed
    -- Check if email_sync table exists and migrate
    SELECT name FROM sqlite_master WHERE type='table' AND name='email_sync';
  `);
}

// Database operations
ipcMain.handle('db:get-jobs', async (event, filters = {}) => {
  try {
    let query = `
      SELECT j.*, e.account_email, e.from_address, e.raw_content 
      FROM jobs j
      LEFT JOIN emails e ON j.email_id = e.id
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

    query += ' ORDER BY j.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = getDb().prepare(query);
    const results = stmt.all(...params);
    
    // Debug log
    if (results.length > 0) {
      console.log(`Found ${results.length} jobs`);
      console.log(`First job raw_content length: ${results[0].raw_content ? results[0].raw_content.length : 'NULL'}`);
      console.log(`First job from_address: ${results[0].from_address}`);
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
      SELECT j.*, e.account_email, e.from_address, e.raw_content 
      FROM jobs j
      LEFT JOIN emails e ON j.email_id = e.id
      WHERE j.id = ?
    `);
    const result = stmt.get(id);
    
    // Debug log
    console.log(`Fetched job ${id}:`);
    console.log(`  raw_content length: ${result?.raw_content ? result.raw_content.length : 'NULL'}`);
    console.log(`  from_address: ${result?.from_address}`);
    console.log(`  Full result keys: ${Object.keys(result || {}).join(', ')}`);
    
    // Ensure all fields are properly serialized
    if (result) {
      // Create a clean object to ensure proper serialization
      const cleanResult = {
        ...result,
        raw_content: result.raw_content || '',
        from_address: result.from_address || '',
        account_email: result.account_email || ''
      };
      console.log(`  Returning clean result with raw_content length: ${cleanResult.raw_content.length}`);
      return cleanResult;
    }
    
    return result;
  } catch (error) {
    console.error('Error fetching job:', error);
    throw error;
  }
});

ipcMain.handle('db:create-job', async (event, job) => {
  try {
    const id = job.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = getDb().prepare(`
      INSERT INTO jobs (id, email_id, company, position, status, job_type, applied_date, location, salary_range, notes, ml_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      id,
      job.email_id || null,
      job.company,
      job.position,
      job.status || 'active',
      job.job_type,
      job.applied_date || new Date().toISOString().split('T')[0],
      job.location,
      job.salary_range,
      job.notes,
      job.ml_confidence
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
ipcMain.handle('classify-email', async (event, content) => {
  try {
    console.log('📧 Classifying email content...');
    const result = await mlHandler.classifyEmail(content);
    
    // Enhance result with additional job extraction logic
    const enhancedResult = {
      ...result,
      job_type: _extractJobType(content, result.is_job_related),
      company: _extractCompany(content),
      position: _extractPosition(content)
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
    const status = await mlHandler.getModelStatus();
    return status;
  } catch (error) {
    console.error('Error getting ML model status:', error);
    throw error;
  }
});

ipcMain.handle('ml:is-ready', async () => {
  try {
    const isReady = await mlHandler.isModelReady();
    return { ready: isReady };
  } catch (error) {
    console.error('Error checking ML model readiness:', error);
    return { ready: false, error: error.message };
  }
});

ipcMain.handle('ml:train-model', async (event, options = {}) => {
  try {
    console.log('🏋️  Starting ML model training...');
    const result = await mlHandler.trainModel(options);
    
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
    const result = await mlHandler.initialize();
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

// New: Fetch emails without classification
ipcMain.handle('gmail:fetch', async (event, options = {}) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const { daysToSync = 90, maxEmails = 500 } = options;
    
    // Update sync status
    const updateStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_fetch_time = CURRENT_TIMESTAMP,
        last_sync_status = 'fetching'
      WHERE id = 1
    `);
    updateStatus.run();

    const query = `in:inbox newer_than:${daysToSync}d`;
    let totalFetched = 0;
    let totalStored = 0;
    let pageToken = null;
    
    mainWindow.webContents.send('fetch-progress', { 
      phase: 'fetching',
      current: 0, 
      total: maxEmails, 
      status: `Fetching emails from the last ${daysToSync} days...` 
    });

    do {
      // Fetch batch of emails
      const result = await gmailAuth.fetchEmails({
        maxResults: Math.min(50, maxEmails - totalFetched),
        query,
        pageToken
      });

      if (!result.messages || result.messages.length === 0) {
        break;
      }

      // Store each email raw
      for (const email of result.messages) {
        try {
          // Check if already exists
          const checkStmt = getDb().prepare('SELECT id FROM emails WHERE gmail_message_id = ?');
          const exists = checkStmt.get(email.id);
          
          if (!exists) {
            // Extract basic info
            const headers = email.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const dateStr = headers.find(h => h.name === 'Date')?.value || '';
            
            // Store raw email
            const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const insertStmt = getDb().prepare(`
              INSERT INTO emails (id, gmail_message_id, subject, from_address, to_address, date, snippet, raw_content, internal_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            insertStmt.run(
              emailId,
              email.id,
              subject,
              from,
              to,
              _extractDate(email),
              email.snippet || '',
              _extractEmailContent(email),
              email.internalDate || null
            );
            
            totalStored++;
          }
          
          totalFetched++;
          
          // Update progress
          mainWindow.webContents.send('fetch-progress', { 
            phase: 'fetching',
            current: totalFetched, 
            total: maxEmails, 
            status: `Fetched ${totalFetched} emails, ${totalStored} new...` 
          });
          
        } catch (error) {
          console.error(`Error storing email ${email.id}:`, error);
        }
      }
      
      pageToken = result.nextPageToken;
      
    } while (pageToken && totalFetched < maxEmails);

    // Update sync status
    const finalStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_sync_status = 'fetch_completed',
        total_emails_fetched = total_emails_fetched + ?
      WHERE id = 1
    `);
    finalStatus.run(totalStored);

    mainWindow.webContents.send('fetch-complete', { 
      fetched: totalFetched,
      stored: totalStored 
    });

    return { 
      success: true, 
      fetched: totalFetched,
      stored: totalStored 
    };
  } catch (error) {
    console.error('Error fetching emails:', error);
    
    const errorStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_sync_status = 'fetch_failed'
      WHERE id = 1
    `);
    errorStatus.run();
    
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send('fetch-error', error.message);
    throw error;
  }
});

// New: Classify emails in batches
ipcMain.handle('emails:classify', async (event, options = {}) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const { batchSize = 50, maxToProcess = null } = options;
    
    // Get unclassified emails
    let query = 'SELECT * FROM emails WHERE is_classified = 0 ORDER BY date DESC LIMIT ?';
    const params = [maxToProcess || batchSize];
    
    const unclassifiedStmt = getDb().prepare(query);
    const emails = unclassifiedStmt.all(...params);
    
    if (emails.length === 0) {
      return { processed: 0, jobsFound: 0, remaining: 0 };
    }
    
    let processed = 0;
    let jobsFound = 0;
    
    mainWindow.webContents.send('classify-progress', {
      phase: 'classifying',
      current: 0,
      total: emails.length,
      status: 'Analyzing emails for job opportunities...'
    });
    
    for (const email of emails) {
      try {
        // Classify email
        const classification = await mlHandler.classifyEmail(email.raw_content);
        
        // Update email with classification
        const updateStmt = getDb().prepare(`
          UPDATE emails SET 
            is_classified = 1,
            is_job_related = ?,
            job_type = ?,
            ml_confidence = ?,
            classification_method = ?,
            classified_at = CURRENT_TIMESTAMP,
            company_extracted = ?,
            position_extracted = ?
          WHERE id = ?
        `);
        
        updateStmt.run(
          classification.is_job_related ? 1 : 0,
          classification.job_type,
          classification.confidence,
          'keyword', // or 'ml' when using full model
          classification.company || _extractCompany(email.raw_content),
          classification.position || _extractPosition(email.raw_content),
          email.id
        );
        
        // If job-related, create job entry
        if (classification.is_job_related) {
          const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const jobStmt = getDb().prepare(`
            INSERT INTO jobs (id, email_id, company, position, status, job_type, applied_date, ml_confidence, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          jobStmt.run(
            jobId,
            email.id,
            extractedCompany,
            extractedPosition,
            'active',
            classification.job_type,
            email.date,
            classification.confidence,
            email.snippet
          );
          
          jobsFound++;
          
          // Send job found notification
          mainWindow.webContents.send('job-found', {
            id: jobId,
            company: classification.company || email.company_extracted,
            position: classification.position || email.position_extracted,
            date: email.date,
            type: classification.job_type
          });
        }
        
        processed++;
        
        // Update progress
        mainWindow.webContents.send('classify-progress', {
          phase: 'classifying',
          current: processed,
          total: emails.length,
          status: `Analyzed ${processed}/${emails.length} emails, found ${jobsFound} jobs...`
        });
        
      } catch (error) {
        console.error(`Error classifying email ${email.id}:`, error);
      }
    }
    
    // Update sync status
    const updateStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_classify_time = CURRENT_TIMESTAMP,
        total_emails_classified = total_emails_classified + ?,
        total_jobs_found = total_jobs_found + ?
      WHERE id = 1
    `);
    updateStatus.run(processed, jobsFound);
    
    // Get remaining count
    const remainingStmt = getDb().prepare('SELECT COUNT(*) as count FROM emails WHERE is_classified = 0');
    const remaining = remainingStmt.get().count;
    
    mainWindow.webContents.send('classify-complete', {
      processed,
      jobsFound,
      remaining
    });
    
    return { processed, jobsFound, remaining };
    
  } catch (error) {
    console.error('Error classifying emails:', error);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send('classify-error', error.message);
    throw error;
  }
});

// Sync handler that uses the new two-stage process
ipcMain.handle('gmail:sync', async (event, options = {}) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    
    // Stage 1: Fetch emails
    console.log('Starting email fetch...');
    const { daysToSync = 90, maxEmails = 500 } = options;
    
    // Fetch emails
    const fetchOptions = { daysToSync, maxEmails };
    const fetchResult = await gmailAuth.fetchEmails({
      maxResults: 50,
      query: `in:inbox newer_than:${daysToSync}d`
    });
    
    if (!fetchResult.messages || fetchResult.messages.length === 0) {
      mainWindow.webContents.send('sync-complete', {
        emailsProcessed: 0,
        jobsFound: 0
      });
      return {
        success: true,
        emailsProcessed: 0,
        jobsFound: 0,
        message: 'No emails found'
      };
    }
    
    // Store fetched emails
    let totalStored = 0;
    let totalFetched = fetchResult.messages.length;
    
    mainWindow.webContents.send('sync-progress', {
      current: 0,
      total: totalFetched,
      status: 'Storing emails...'
    });
    
    for (const email of fetchResult.messages) {
      try {
        // Check if already exists
        const checkStmt = getDb().prepare('SELECT id FROM emails WHERE gmail_message_id = ?');
        const exists = checkStmt.get(email.id);
        
        if (!exists) {
          const headers = email.payload?.headers || [];
          const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          const insertStmt = getDb().prepare(`
            INSERT INTO emails (id, gmail_message_id, subject, from_address, to_address, date, snippet, raw_content, internal_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          insertStmt.run(
            emailId,
            email.id,
            headers.find(h => h.name === 'Subject')?.value || '',
            headers.find(h => h.name === 'From')?.value || '',
            headers.find(h => h.name === 'To')?.value || '',
            _extractDate(email),
            email.snippet || '',
            _extractEmailContent(email),
            email.internalDate || null
          );
          
          totalStored++;
        }
      } catch (error) {
        console.error(`Error storing email ${email.id}:`, error);
      }
    }
    
    // Stage 2: Classify stored emails
    console.log(`Stored ${totalStored} new emails, starting classification...`);
    
    const unclassifiedStmt = getDb().prepare('SELECT * FROM emails WHERE is_classified = 0 ORDER BY date DESC LIMIT 100');
    const unclassifiedEmails = unclassifiedStmt.all();
    
    let totalClassified = 0;
    let totalJobsFound = 0;
    
    mainWindow.webContents.send('sync-progress', {
      current: 0,
      total: unclassifiedEmails.length,
      status: 'Analyzing emails for job opportunities...'
    });
    
    for (const email of unclassifiedEmails) {
      try {
        const classification = await mlHandler.classifyEmail(email.raw_content);
        
        // Update email with classification
        const updateStmt = getDb().prepare(`
          UPDATE emails SET 
            is_classified = 1,
            is_job_related = ?,
            job_type = ?,
            ml_confidence = ?,
            classification_method = 'ml',
            classified_at = CURRENT_TIMESTAMP,
            company_extracted = ?,
            position_extracted = ?
          WHERE id = ?
        `);
        
        // Extract company and position
        const extractedCompany = _extractCompany(email.raw_content);
        const extractedPosition = _extractPosition(email.raw_content);
        
        updateStmt.run(
          classification.is_job_related ? 1 : 0,
          classification.job_type,
          classification.confidence,
          extractedCompany,
          extractedPosition,
          email.id
        );
        
        if (classification.is_job_related) {
          // Create job entry
          const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const jobStmt = getDb().prepare(`
            INSERT INTO jobs (id, email_id, company, position, status, job_type, applied_date, ml_confidence, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          jobStmt.run(
            jobId,
            email.id,
            _extractCompany(email.raw_content),
            _extractPosition(email.raw_content),
            'active',
            classification.job_type,
            email.date,
            classification.confidence,
            email.snippet
          );
          
          totalJobsFound++;
          
          mainWindow.webContents.send('job-found', {
            id: jobId,
            company: _extractCompany(email.raw_content),
            position: _extractPosition(email.raw_content),
            date: email.date
          });
        }
        
        totalClassified++;
        
        mainWindow.webContents.send('sync-progress', {
          current: totalClassified,
          total: unclassifiedEmails.length,
          status: `Analyzed ${totalClassified}/${unclassifiedEmails.length} emails, found ${totalJobsFound} jobs...`
        });
        
      } catch (error) {
        console.error(`Error classifying email ${email.id}:`, error);
      }
    }
    
    // Update sync status
    const updateStatus = getDb().prepare(`
      UPDATE sync_status SET 
        last_fetch_time = CURRENT_TIMESTAMP,
        last_classify_time = CURRENT_TIMESTAMP,
        last_sync_status = 'completed',
        total_emails_fetched = total_emails_fetched + ?,
        total_emails_classified = total_emails_classified + ?,
        total_jobs_found = total_jobs_found + ?
      WHERE id = 1
    `);
    updateStatus.run(totalStored, totalClassified, totalJobsFound);
    
    mainWindow.webContents.send('sync-complete', {
      emailsProcessed: totalFetched,
      jobsFound: totalJobsFound
    });
    
    return {
      success: true,
      emailsProcessed: totalFetched,
      emailsStored: totalStored,
      emailsClassified: totalClassified,
      jobsFound: totalJobsFound
    };
    
  } catch (error) {
    console.error('Sync error:', error);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send('sync-error', error.message);
    throw error;
  }
});

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
      const timestamp = parseInt(email.internalDate);
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        console.log(`Using internal date: ${timestamp} -> ${date.toISOString()}`);
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
        INSERT INTO email_sync (gmail_message_id, processed_at, is_job_related)
        VALUES (?, ?, ?)
      `);

      for (const email of data.emailSync) {
        emailStmt.run(
          email.gmail_message_id,
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
          maxResults: 50,
          query: `in:inbox newer_than:${daysToSync}d`
        });
        
        if (!fetchResult.messages || fetchResult.messages.length === 0) {
          continue;
        }
        
        // Store fetched emails
        for (const email of fetchResult.messages) {
          try {
            // Check if already exists
            const checkStmt = getDb().prepare('SELECT id FROM emails WHERE gmail_message_id = ? AND account_email = ?');
            const exists = checkStmt.get(email.id, account.email);
            
            if (!exists) {
              const headers = email.payload?.headers || [];
              const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              
              const insertStmt = getDb().prepare(`
                INSERT INTO emails (id, gmail_message_id, subject, from_address, to_address, date, snippet, raw_content, account_email, internal_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              
              insertStmt.run(
                emailId,
                email.id,
                headers.find(h => h.name === 'Subject')?.value || '',
                headers.find(h => h.name === 'From')?.value || '',
                headers.find(h => h.name === 'To')?.value || '',
                _extractDate(email),
                email.snippet || '',
                _extractEmailContent(email),
                account.email,
                email.internalDate || null
              );
              
              totalEmailsFetched++;
            }
          } catch (error) {
            console.error(`Error storing email ${email.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error syncing account ${account.email}:`, error);
      }
    }
    
    // Stage 2: Classify unclassified emails
    console.log(`Fetched ${totalEmailsFetched} new emails, starting classification...`);
    
    const unclassifiedStmt = getDb().prepare('SELECT * FROM emails WHERE is_classified = 0 ORDER BY date DESC LIMIT 100');
    const unclassifiedEmails = unclassifiedStmt.all();
    
    mainWindow.webContents.send('sync-progress', {
      current: 0,
      total: unclassifiedEmails.length,
      status: 'Analyzing emails for job opportunities...'
    });
    
    for (const email of unclassifiedEmails) {
      try {
        const classification = await mlHandler.classifyEmail(email.raw_content);
        
        // Update email with classification
        const updateStmt = getDb().prepare(`
          UPDATE emails SET 
            is_classified = 1,
            is_job_related = ?,
            job_type = ?,
            ml_confidence = ?,
            classification_method = 'ml',
            classified_at = CURRENT_TIMESTAMP,
            company_extracted = ?,
            position_extracted = ?
          WHERE id = ?
        `);
        
        // Extract company and position
        const extractedCompany = _extractCompany(email.raw_content);
        const extractedPosition = _extractPosition(email.raw_content);
        
        updateStmt.run(
          classification.is_job_related ? 1 : 0,
          classification.job_type,
          classification.confidence,
          extractedCompany,
          extractedPosition,
          email.id
        );
        
        totalEmailsClassified++;
        
        // If job-related, create job entry
        if (classification.is_job_related) {
          const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const jobStmt = getDb().prepare(`
            INSERT INTO jobs (id, email_id, company, position, status, job_type, applied_date, ml_confidence, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          jobStmt.run(
            jobId,
            email.id,
            extractedCompany,
            extractedPosition,
            'active',
            classification.job_type,
            email.date,
            classification.confidence,
            email.snippet
          );
          
          totalJobsFound++;
        }
        
        mainWindow.webContents.send('sync-progress', {
          current: totalEmailsClassified,
          total: unclassifiedEmails.length,
          status: `Classified ${totalEmailsClassified} emails, found ${totalJobsFound} jobs...`
        });
      } catch (error) {
        console.error(`Error classifying email:`, error);
      }
    }
    
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
