/**
 * Migration to add unified email_pipeline table
 * This consolidates email processing into a single table with JSON storage for extraction attempts
 */

function addEmailPipelineTables(db) {
  console.log('Creating email_pipeline tables...');
  
  try {
    // Create main pipeline table
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_pipeline (
        -- Primary identification
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gmail_message_id TEXT NOT NULL,
        thread_id TEXT,
        account_email TEXT NOT NULL,
        
        -- Original email content
        subject TEXT,
        from_address TEXT,
        body TEXT,
        email_date TIMESTAMP,
        raw_email_data TEXT, -- JSON with headers, labels, etc.
        
        -- Stage 1: Pre-filter (Digest Detection)
        is_digest BOOLEAN DEFAULT 0,
        digest_reason TEXT, -- e.g., 'digest_domain:linkedin.com'
        digest_confidence REAL,
        
        -- Stage 2: Classification (ML or digest filter)
        is_job_related BOOLEAN,
        confidence REAL,
        classification_method TEXT, -- 'ml', 'digest_filter', 'manual'
        classified_at TIMESTAMP,
        classification_time_ms INTEGER,
        human_verified BOOLEAN DEFAULT 0,
        
        -- Stage 3: LLM Extraction (Multiple models)
        extraction_attempts TEXT, -- JSON array of all extraction attempts
        /* Example extraction_attempts structure:
        [
          {
            "model_id": "llama-3-8b-instruct-q5_k_m",
            "test_run_id": "run-2024-01-15-001",
            "extracted": {
              "company": "Google",
              "position": "Software Engineer",
              "status": "Applied",
              "location": "Mountain View, CA",
              "remote_status": "hybrid",
              "salary_range": "$150k-200k"
            },
            "extraction_time_ms": 1234,
            "raw_response": "full LLM output...",
            "extracted_at": "2024-01-15T10:30:00Z"
          }
        ]
        */
        
        -- Selected/Best extraction
        selected_extraction TEXT, -- JSON of the chosen extraction
        selected_model_id TEXT,
        selection_method TEXT, -- 'manual', 'auto_best', 'consensus'
        
        -- Pipeline status tracking
        pipeline_stage TEXT DEFAULT 'fetched' CHECK(pipeline_stage IN (
          'fetched',              -- Email retrieved from Gmail
          'classified',           -- Classification complete (ML or filter)
          'ready_for_extraction', -- Approved for LLM extraction
          'extracted',            -- LLM extraction complete
          'in_jobs'              -- Promoted to jobs table
        )),
        
        -- Links and metadata
        jobs_table_id TEXT, -- FK to jobs table if promoted
        needs_review BOOLEAN DEFAULT 0,
        review_reason TEXT,
        user_feedback TEXT,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        UNIQUE(gmail_message_id, account_email)
      );
    `);

    // Create indexes for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_account ON email_pipeline(account_email);
      CREATE INDEX IF NOT EXISTS idx_pipeline_thread ON email_pipeline(thread_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON email_pipeline(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_pipeline_job ON email_pipeline(is_job_related);
      CREATE INDEX IF NOT EXISTS idx_pipeline_confidence ON email_pipeline(confidence);
      CREATE INDEX IF NOT EXISTS idx_pipeline_human_verified ON email_pipeline(human_verified);
      CREATE INDEX IF NOT EXISTS idx_pipeline_review ON email_pipeline(needs_review);
      CREATE INDEX IF NOT EXISTS idx_pipeline_date ON email_pipeline(email_date);
      CREATE INDEX IF NOT EXISTS idx_pipeline_message ON email_pipeline(gmail_message_id);
    `);

    // Create test runs management table
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY, -- e.g., "run-2024-01-15-001"
        description TEXT,
        model_ids TEXT, -- JSON array of models used
        date_from TEXT,
        date_to TEXT,
        total_emails INTEGER,
        emails_classified INTEGER,
        jobs_found INTEGER,
        settings TEXT, -- JSON of test configuration
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create model performance tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        test_run_id TEXT,
        total_extractions INTEGER DEFAULT 0,
        avg_extraction_time_ms REAL,
        successful_extractions INTEGER DEFAULT 0,
        failed_extractions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
      );
    `);

    console.log('Email pipeline tables created successfully');
    return true;
  } catch (error) {
    console.error('Error creating email_pipeline tables:', error);
    throw error;
  }
}

// Migration function to transfer existing data
function migrateExistingData(db) {
  console.log('Migrating existing data to email_pipeline...');
  
  try {
    // Check if classification_queue exists and has data
    const queueExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='classification_queue'"
    ).get();
    
    if (!queueExists) {
      console.log('No existing classification_queue table to migrate');
      return true;
    }

    // Count existing records
    const count = db.prepare('SELECT COUNT(*) as count FROM classification_queue').get();
    console.log(`Found ${count.count} records to migrate`);

    if (count.count > 0) {
      // Migrate data from classification_queue to email_pipeline
      db.exec(`
        INSERT OR IGNORE INTO email_pipeline (
          gmail_message_id,
          thread_id,
          account_email,
          subject,
          from_address,
          body,
          email_date,
          is_digest,
          digest_reason,
          is_job_related,
          confidence,
          classified_at,
          classification_time_ms,
          classification_method,
          pipeline_stage,
          needs_review,
          created_at,
          updated_at
        )
        SELECT 
          gmail_message_id,
          thread_id,
          account_email,
          subject,
          from_address,
          body,
          email_date,
          CASE WHEN filter_reason IS NOT NULL THEN 1 ELSE 0 END as is_digest,
          filter_reason as digest_reason,
          is_job_related,
          job_probability as confidence,
          updated_at as classified_at,
          processing_time as classification_time_ms,
          CASE 
            WHEN filter_reason IS NOT NULL THEN 'digest_filter'
            ELSE 'ml'
          END as classification_method,
          CASE 
            WHEN is_job_related = 1 AND needs_review = 0 THEN 'ready_for_extraction'
            WHEN is_job_related IS NOT NULL THEN 'classified'
            ELSE 'fetched'
          END as pipeline_stage,
          needs_review,
          created_at,
          updated_at
        FROM classification_queue
      `);

      console.log('Data migration completed successfully');
    }

    return true;
  } catch (error) {
    console.error('Error migrating data:', error);
    // Don't throw - allow app to continue even if migration fails
    return false;
  }
}

module.exports = {
  addEmailPipelineTables,
  migrateExistingData
};