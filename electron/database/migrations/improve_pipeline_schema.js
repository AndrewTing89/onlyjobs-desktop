/**
 * Comprehensive Pipeline Schema Improvement Migration
 * 
 * This migration separates workflow stages from classification methods for cleaner design:
 * - pipeline_stage: Workflow position (fetched, classified, ready_for_extraction, extracted, in_jobs)  
 * - classification_method: How classified (digest_filter, ml, llm, human, rule_based)
 * - is_classified: Boolean indicating if classification is complete
 */

function improvePipelineSchema(db) {
  console.log('🔄 Starting comprehensive pipeline schema improvement...');
  
  try {
    // Check if we need to do this migration
    const tableInfo = db.prepare("PRAGMA table_info(email_pipeline)").all();
    if (tableInfo.length === 0) {
      console.log('email_pipeline table does not exist, skipping migration');
      return { success: true };
    }
    
    // Check if migration already applied
    const hasClassificationMethod = tableInfo.some(col => col.name === 'classification_method');
    if (hasClassificationMethod) {
      console.log('Pipeline schema already improved, skipping migration');
      return { success: true };
    }
    
    console.log('📊 Current table has columns:', tableInfo.map(col => col.name).join(', '));
    
    // Start transaction
    console.log('🔄 Starting database transaction...');
    db.exec('BEGIN');
    
    // Create new improved table
    console.log('📋 Creating new email_pipeline table with improved schema...');
    db.exec(`
      CREATE TABLE email_pipeline_improved (
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
        job_probability REAL DEFAULT 0, -- 0-1 probability score (unified confidence)
        is_job_related BOOLEAN DEFAULT 0,
        
        -- NEW: Improved pipeline design
        pipeline_stage TEXT DEFAULT 'fetched' CHECK(pipeline_stage IN (
          'fetched',              -- Email retrieved from Gmail
          'classified',           -- Classification complete (any method)
          'ready_for_extraction', -- Approved for LLM extraction  
          'extracted',            -- LLM extraction complete
          'in_jobs'              -- Promoted to jobs table
        )),
        classification_method TEXT CHECK(classification_method IN (
          'digest_filter',        -- Filtered by digest detector
          'ml',                  -- ML Random Forest classifier
          'llm',                 -- LLM classification
          'human',               -- Manual human classification
          'rule_based',          -- Rule-based classification
          NULL                   -- Not yet classified
        )),
        is_classified BOOLEAN DEFAULT 0,
        
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
    
    // Skip data migration - will get fresh data from sync
    console.log('⏭️ Skipping data migration - will get fresh data from sync');
    
    // Drop old table and rename new one
    console.log('🗑️ Replacing old table with improved version...');
    db.exec('DROP TABLE email_pipeline');
    db.exec('ALTER TABLE email_pipeline_improved RENAME TO email_pipeline');
    
    // Recreate indexes for performance
    console.log('🔍 Creating optimized indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_gmail_id ON email_pipeline(gmail_message_id);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_account ON email_pipeline(account_email);  
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_stage ON email_pipeline(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_method ON email_pipeline(classification_method);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_classified ON email_pipeline(is_classified);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_date ON email_pipeline(date_received);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_job_prob ON email_pipeline(job_probability);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_needs_review ON email_pipeline(needs_review);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_user_class ON email_pipeline(user_classification);
      CREATE INDEX IF NOT EXISTS idx_email_pipeline_composite ON email_pipeline(pipeline_stage, classification_method, is_classified);
    `);
    
    // Commit transaction
    console.log('✅ Committing pipeline schema improvements...');
    db.exec('COMMIT');
    
    // Verify the migration worked
    const schemaCheck = db.prepare("PRAGMA table_info(email_pipeline)").all();
    const hasNewColumns = schemaCheck.some(col => col.name === 'classification_method') && 
                         schemaCheck.some(col => col.name === 'is_classified');
    
    if (hasNewColumns) {
      console.log('🎉 Pipeline schema improvement completed successfully!');
      console.log('✅ New clean schema ready for fresh sync data');
      return { success: true, recordsMigrated: 0 };
    } else {
      throw new Error('Migration verification failed: missing new columns');
    }
    
  } catch (error) {
    // Rollback on error
    try {
      console.log('❌ Migration failed, rolling back...');
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('💥 Critical: Rollback failed:', rollbackError);
    }
    
    console.error('💥 Error improving pipeline schema:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { improvePipelineSchema };