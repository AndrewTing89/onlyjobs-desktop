/**
 * Database initialization and schema management
 * 
 * This module handles the complete database schema including:
 * - Core job tracking tables
 * - Email sync and processing tables
 * - Human-in-the-loop classification system
 * - Training feedback collection
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class DatabaseInitializer {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(app.getPath('userData'), 'jobs.db');
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      // Enable foreign key constraints
      this.db.pragma('foreign_keys = ON');
    }
    return this.db;
  }

  /**
   * Initialize complete database schema
   */
  initializeDatabase() {
    const db = this.getDb();
    
    try {
      console.log('Initializing database schema...');
      
      // Begin transaction for atomic schema creation
      db.exec('BEGIN TRANSACTION');
      
      // Create core tables
      this.createGmailAccountsTable(db);
      this.createJobsTable(db);
      this.createEmailSyncTable(db);
      this.createSyncStatusTable(db);
      this.createSyncHistoryTable(db);
      this.createLLMCacheTable(db);
      this.createModelPromptsTable(db);
      
      // Create human-in-the-loop tables
      this.createClassificationQueueTable(db);
      // Training feedback table removed
      
      // Create test tables (for model testing)
      this.createTestTables(db);
      
      // Create all indexes
      this.createIndexes(db);
      
      // Commit transaction
      db.exec('COMMIT');
      
      console.log('Database schema initialization completed successfully');
      return { success: true };
      
    } catch (error) {
      console.error('Error initializing database schema:', error);
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Gmail accounts table
   */
  createGmailAccountsTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gmail_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        scope TEXT,
        token_type TEXT DEFAULT 'Bearer',
        is_active BOOLEAN DEFAULT 1,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Create main jobs table with human-in-the-loop columns
   */
  createJobsTable(db) {
    db.exec(`
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
        thread_id TEXT,
        email_thread_ids TEXT,
        
        -- Human-in-the-loop classification columns
        classification_status TEXT DEFAULT 'pending' CHECK(classification_status IN ('pending', 'ml_classified', 'human_verified', 'parsed', 'rejected')),
        needs_review BOOLEAN DEFAULT 0,
        reviewed_at TIMESTAMP,
        reviewed_by TEXT,
        parse_status TEXT DEFAULT 'unparsed' CHECK(parse_status IN ('unparsed', 'queued', 'parsing', 'parsed', 'failed')),
        parse_attempted_at TIMESTAMP,
        parse_completed_at TIMESTAMP,
        raw_email_content TEXT,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(gmail_message_id, account_email)
      )
    `);
  }

  /**
   * Create email sync tracking table
   */
  createEmailSyncTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_sync (
        gmail_message_id TEXT,
        account_email TEXT NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_job_related BOOLEAN DEFAULT 0,
        PRIMARY KEY (gmail_message_id, account_email)
      )
    `);
  }

  /**
   * Create sync status table
   */
  createSyncStatusTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_fetch_time TIMESTAMP,
        last_classify_time TIMESTAMP,
        last_sync_status TEXT,
        total_emails_fetched INTEGER DEFAULT 0,
        total_emails_classified INTEGER DEFAULT 0,
        total_jobs_found INTEGER DEFAULT 0
      )
    `);
  }

  /**
   * Create sync history log table
   */
  createSyncHistoryTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accounts_synced INTEGER,
        emails_fetched INTEGER,
        emails_processed INTEGER,
        jobs_found INTEGER,
        duration_ms INTEGER,
        success BOOLEAN DEFAULT 1,
        error_message TEXT
      )
    `);
  }

  /**
   * Create LLM cache table
   */
  createLLMCacheTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_cache (
        id TEXT PRIMARY KEY,
        input_hash TEXT UNIQUE NOT NULL,
        stage INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        result TEXT NOT NULL,
        confidence REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);
  }

  /**
   * Create model prompts table
   */
  createModelPromptsTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        stage INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(model_name, stage)
      )
    `);
  }

  /**
   * Create classification queue table for human-in-the-loop system
   */
  createClassificationQueueTable(db) {
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
        confidence REAL DEFAULT 0,
        needs_review BOOLEAN DEFAULT 0,
        classification_status TEXT DEFAULT 'pending' CHECK(classification_status IN ('pending', 'classified', 'approved', 'rejected', 'queued_for_parsing', 'reviewed')),
        parse_status TEXT DEFAULT 'pending' CHECK(parse_status IN ('pending', 'parsing', 'parsed', 'failed', 'skip')),
        company TEXT,
        position TEXT,
        status TEXT,
        raw_email_data TEXT,
        user_feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processing_time INTEGER DEFAULT 0
      )
    `);
  }

  // Training feedback table removed - will export classified data directly instead

  /**
   * Create test tables for model evaluation
   */
  createTestTables(db) {
    const testTables = ['jobs_llama_test', 'jobs_qwen_test', 'jobs_hermes_test'];
    
    for (const tableName of testTables) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
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
          thread_id TEXT,
          email_thread_ids TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(gmail_message_id, account_email)
        )
      `);
    }
  }

  /**
   * Create all necessary indexes for performance
   */
  createIndexes(db) {
    const indexes = [
      // Jobs table indexes
      'CREATE INDEX IF NOT EXISTS idx_jobs_gmail_message_id ON jobs(gmail_message_id)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_account_email ON jobs(account_email)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_thread_id ON jobs(thread_id)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_classification_status ON jobs(classification_status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_needs_review ON jobs(needs_review)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_parse_status ON jobs(parse_status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_reviewed_at ON jobs(reviewed_at)',
      
      // Email sync indexes
      'CREATE INDEX IF NOT EXISTS idx_email_sync_account_email ON email_sync(account_email)',
      'CREATE INDEX IF NOT EXISTS idx_email_sync_processed_at ON email_sync(processed_at)',
      'CREATE INDEX IF NOT EXISTS idx_email_sync_is_job_related ON email_sync(is_job_related)',
      
      // LLM cache indexes
      'CREATE INDEX IF NOT EXISTS idx_llm_cache_input_hash ON llm_cache(input_hash)',
      'CREATE INDEX IF NOT EXISTS idx_llm_cache_expires_at ON llm_cache(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_llm_cache_stage_model ON llm_cache(stage, model_name)',
      
      // Classification queue indexes
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_gmail_message_id ON classification_queue(gmail_message_id)',
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_account ON classification_queue(account_email)',
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_status ON classification_queue(classification_status)',
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_parse_status ON classification_queue(parse_status)',
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_needs_review ON classification_queue(needs_review)',
      'CREATE INDEX IF NOT EXISTS idx_classification_queue_thread_id ON classification_queue(thread_id)',
      
      // Training feedback indexes
      'CREATE INDEX IF NOT EXISTS idx_training_feedback_gmail_message_id ON training_feedback(gmail_message_id)',
      'CREATE INDEX IF NOT EXISTS idx_training_feedback_exported ON training_feedback(exported)',
      'CREATE INDEX IF NOT EXISTS idx_training_feedback_human_label ON training_feedback(human_label)',
      'CREATE INDEX IF NOT EXISTS idx_training_feedback_corrected_at ON training_feedback(corrected_at)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_training_feedback_feature_hash ON training_feedback(feature_hash)'
    ];
    
    for (const indexSql of indexes) {
      try {
        db.exec(indexSql);
      } catch (error) {
        console.warn(`Index creation warning: ${error.message}`);
      }
    }
  }

  /**
   * Run database migrations
   */
  runMigrations() {
    try {
      // Run thread support migration if needed
      this.addThreadSupportIfNeeded();
      
      // Run human-in-the-loop migration if needed
      this.addHumanInLoopIfNeeded();
      
      // Update classification_status constraint to include new statuses
      this.updateClassificationStatusConstraint();
      
      // Rename confidence columns to job_probability
      this.renameConfidenceToJobProbability();
      
      return { success: true };
    } catch (error) {
      console.error('Error running migrations:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add thread support columns if they don't exist
   */
  addThreadSupportIfNeeded() {
    const db = this.getDb();
    const tableInfo = db.pragma('table_info(jobs)');
    const columnNames = tableInfo.map(col => col.name);
    
    if (!columnNames.includes('thread_id')) {
      console.log('Adding thread_id column to jobs table...');
      db.exec('ALTER TABLE jobs ADD COLUMN thread_id TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_thread_id ON jobs(thread_id)');
    }
    
    if (!columnNames.includes('email_thread_ids')) {
      console.log('Adding email_thread_ids column to jobs table...');
      db.exec('ALTER TABLE jobs ADD COLUMN email_thread_ids TEXT');
    }
  }

  /**
   * Add human-in-the-loop columns if they don't exist
   */
  addHumanInLoopIfNeeded() {
    const db = this.getDb();
    const tableInfo = db.pragma('table_info(jobs)');
    const columnNames = tableInfo.map(col => col.name);
    
    const newColumns = [
      'classification_status TEXT DEFAULT \'pending\'',
      'needs_review BOOLEAN DEFAULT 0',
      'reviewed_at TIMESTAMP',
      'reviewed_by TEXT',
      'parse_status TEXT DEFAULT \'unparsed\'',
      'parse_attempted_at TIMESTAMP',
      'parse_completed_at TIMESTAMP',
      'raw_email_content TEXT'
    ];
    
    for (const columnDef of newColumns) {
      const columnName = columnDef.split(' ')[0];
      if (!columnNames.includes(columnName)) {
        console.log(`Adding ${columnName} column to jobs table...`);
        db.exec(`ALTER TABLE jobs ADD COLUMN ${columnDef}`);
      }
    }
  }

  /**
   * Rename confidence columns to job_probability
   */
  renameConfidenceToJobProbability() {
    const db = this.getDb();
    
    try {
      // Check if classification_queue table exists
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classification_queue'").all();
      if (tables.length > 0) {
        // Check if confidence column exists
        const tableInfo = db.pragma('table_info(classification_queue)');
        const columnNames = tableInfo.map(col => col.name);
        
        if (columnNames.includes('confidence') && !columnNames.includes('job_probability')) {
          console.log('Renaming confidence column to job_probability in classification_queue...');
          
          // SQLite doesn't support RENAME COLUMN in older versions, so we need to recreate the table
          db.exec(`
            -- Create new table with job_probability column
            CREATE TABLE classification_queue_new (
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
              classification_status TEXT DEFAULT 'pending',
              parse_status TEXT DEFAULT 'pending',
              company TEXT,
              position TEXT,
              status TEXT,
              raw_email_data TEXT,
              user_feedback TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              processing_time INTEGER DEFAULT 0
            );
            
            -- Copy data from old table
            INSERT INTO classification_queue_new 
            SELECT 
              id, gmail_message_id, thread_id, account_email, subject, from_address, body,
              is_job_related, confidence as job_probability, needs_review, classification_status,
              parse_status, company, position, status, raw_email_data, user_feedback,
              created_at, updated_at, processing_time
            FROM classification_queue;
            
            -- Drop old table
            DROP TABLE classification_queue;
            
            -- Rename new table
            ALTER TABLE classification_queue_new RENAME TO classification_queue;
            
            -- Recreate indexes
            CREATE INDEX IF NOT EXISTS idx_classification_queue_account ON classification_queue(account_email);
            CREATE INDEX IF NOT EXISTS idx_classification_queue_status ON classification_queue(classification_status);
            CREATE INDEX IF NOT EXISTS idx_classification_queue_thread ON classification_queue(thread_id);
          `);
        } else if (columnNames.includes('job_probability')) {
          console.log('classification_queue already has job_probability column');
        }
      }
      
      // Also update jobs table if needed
      const jobsTableInfo = db.pragma('table_info(jobs)');
      const jobsColumnNames = jobsTableInfo.map(col => col.name);
      
      if (jobsColumnNames.includes('ml_confidence') && !jobsColumnNames.includes('job_probability')) {
        console.log('Renaming ml_confidence column to job_probability in jobs table...');
        
        // For jobs table, we can try the simpler approach first
        try {
          db.exec('ALTER TABLE jobs RENAME COLUMN ml_confidence TO job_probability');
        } catch (e) {
          // If that fails, we need to recreate the table
          console.log('Using table recreation method for jobs table...');
          // This would be more complex as jobs table has more columns and relationships
          // For now, just add the new column and copy data
          db.exec('ALTER TABLE jobs ADD COLUMN job_probability REAL');
          db.exec('UPDATE jobs SET job_probability = ml_confidence WHERE ml_confidence IS NOT NULL');
        }
      }
      
    } catch (error) {
      console.error('Error in renameConfidenceToJobProbability migration:', error);
      // Non-fatal - continue with other migrations
    }
  }

  /**
   * Update classification_status constraint to include new statuses
   */
  updateClassificationStatusConstraint() {
    const db = this.getDb();
    
    try {
      // Check if we need to update the constraint
      const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='classification_queue'").get();
      
      if (tableInfo && tableInfo.sql) {
        // Check if the constraint already includes the new statuses
        if (!tableInfo.sql.includes('approved') || !tableInfo.sql.includes('rejected')) {
          console.log('Updating classification_status constraint in classification_queue table...');
          
          // SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
          // First, rename the old table
          db.exec('ALTER TABLE classification_queue RENAME TO classification_queue_old');
          
          // Create new table with updated constraint
          this.createClassificationQueueTable(db);
          
          // Copy data from old table
          db.exec(`
            INSERT INTO classification_queue 
            SELECT * FROM classification_queue_old
          `);
          
          // Drop old table
          db.exec('DROP TABLE classification_queue_old');
          
          console.log('Successfully updated classification_status constraint');
        }
      }
    } catch (error) {
      console.log('Note: Could not update classification_status constraint:', error.message);
      // This is not critical - new databases will have the correct constraint
    }
  }

  /**
   * Update training_feedback table to include missing columns
   */
  // Training feedback migration removed - no longer needed

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export the initializer class
module.exports = DatabaseInitializer;

// Also export a convenience function for direct use
function initializeDatabase(dbPath = null) {
  const initializer = new DatabaseInitializer(dbPath);
  const result = initializer.initializeDatabase();
  initializer.runMigrations();
  return result;
}

module.exports.initializeDatabase = initializeDatabase;