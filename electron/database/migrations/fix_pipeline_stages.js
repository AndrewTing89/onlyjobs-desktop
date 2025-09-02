/**
 * Migration to fix pipeline_stage CHECK constraint
 * 
 * Adds 'digested' as a valid pipeline stage for emails filtered by digest detector.
 */

function fixPipelineStages(db) {
  console.log('Fixing pipeline_stage CHECK constraint to include digested...');
  
  try {
    // SQLite doesn't support modifying CHECK constraints directly
    // We need to recreate the table with the updated constraint
    
    // First, check if we need to do this migration
    const tableInfo = db.prepare("PRAGMA table_info(email_pipeline)").all();
    if (tableInfo.length === 0) {
      console.log('email_pipeline table does not exist, skipping migration');
      return { success: true };
    }
    
    // Start transaction
    db.exec('BEGIN');
    
    // Create temporary table with updated constraint
    db.exec(`
      CREATE TABLE email_pipeline_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gmail_message_id TEXT NOT NULL UNIQUE,
        thread_id TEXT,
        account_email TEXT NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        plaintext TEXT NOT NULL,
        body_html TEXT,
        date_received TEXT NOT NULL,
        
        -- ML Classification results
        ml_classification TEXT, -- JSON string of classification result
        job_probability REAL DEFAULT 0, -- 0-1 probability score
        is_job_related BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 0, -- Backwards compatibility
        
        -- Pipeline status tracking
        pipeline_stage TEXT DEFAULT 'fetched' CHECK(pipeline_stage IN (
          'fetched',              -- Email retrieved from Gmail
          'digested',            -- Filtered by digest detector
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
        
        -- User review tracking
        user_classification TEXT, -- 'HIL_approved', 'HIL_rejected', etc.
        reviewed_at TEXT,
        reviewed_by TEXT,
        
        -- Timestamps
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Copy data from old table
    db.exec(`
      INSERT INTO email_pipeline_new 
      SELECT * FROM email_pipeline
    `);
    
    // Drop old table
    db.exec('DROP TABLE email_pipeline');
    
    // Rename new table
    db.exec('ALTER TABLE email_pipeline_new RENAME TO email_pipeline');
    
    // Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_gmail_id ON email_pipeline(gmail_message_id);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_account ON email_pipeline(account_email);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_stage ON email_pipeline(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_date ON email_pipeline(date_received);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_job_prob ON email_pipeline(job_probability);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_needs_review ON email_pipeline(needs_review);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_user_class ON email_pipeline(user_classification);
    `);
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('Pipeline stages fixed successfully - added digested stage');
    return { success: true };
    
  } catch (error) {
    // Rollback on error
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back pipeline stages fix:', rollbackError);
    }
    
    console.error('Error fixing pipeline stages:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { fixPipelineStages };