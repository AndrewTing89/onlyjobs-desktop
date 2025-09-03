/**
 * DEPRECATED: Database migration to add human-in-the-loop classification system
 * This migration has been superseded by improve_pipeline_schema.js
 * Kept for historical record only - do not use for new installations
 * 
 * This migration adds support for:
 * 1. Enhanced job classification status tracking
 * 2. Queue management for pending classifications
 * 3. Training feedback collection for ML model improvements
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function addHumanInLoopTables(customDbPath = null) {
  let dbPath;
  
  if (customDbPath) {
    dbPath = customDbPath;
  } else {
    // Handle both Electron and standalone Node.js environments
    try {
      const { app } = require('electron');
      dbPath = path.join(app.getPath('userData'), 'jobs.db');
    } catch (error) {
      // Fallback for testing outside Electron
      dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'onlyjobs-desktop', 'jobs.db');
    }
  }
  
  const db = new Database(dbPath);
  
  try {
    console.log('Starting human-in-the-loop tables migration...');
    
    // Begin transaction for atomic migration
    db.exec('BEGIN TRANSACTION');
    
    // 1. Add new columns to jobs table
    console.log('Adding new columns to jobs table...');
    const jobsTableInfo = db.pragma('table_info(jobs)');
    const existingColumns = jobsTableInfo.map(col => col.name);
    
    const newJobsColumns = [
      {
        name: 'classification_status',
        definition: 'classification_status TEXT DEFAULT \'pending\' CHECK(classification_status IN (\'pending\', \'ml_classified\', \'human_verified\', \'parsed\', \'rejected\'))'
      },
      {
        name: 'ml_confidence',
        definition: 'ml_confidence REAL' // Note: This might already exist from legacy
      },
      {
        name: 'needs_review',
        definition: 'needs_review BOOLEAN DEFAULT 0'
      },
      {
        name: 'reviewed_at',
        definition: 'reviewed_at TIMESTAMP'
      },
      {
        name: 'reviewed_by',
        definition: 'reviewed_by TEXT'
      },
      {
        name: 'parse_status',
        definition: 'parse_status TEXT DEFAULT \'unparsed\' CHECK(parse_status IN (\'unparsed\', \'queued\', \'parsing\', \'parsed\', \'failed\'))'
      },
      {
        name: 'parse_attempted_at',
        definition: 'parse_attempted_at TIMESTAMP'
      },
      {
        name: 'parse_completed_at',
        definition: 'parse_completed_at TIMESTAMP'
      },
      {
        name: 'raw_email_content',
        definition: 'raw_email_content TEXT'
      }
    ];
    
    for (const column of newJobsColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding ${column.name} column to jobs table...`);
        db.exec(`ALTER TABLE jobs ADD COLUMN ${column.definition}`);
      } else {
        console.log(`Column ${column.name} already exists in jobs table`);
      }
    }
    
    // 2. Create classification_queue table
    console.log('Creating classification_queue table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS classification_queue (
        id TEXT PRIMARY KEY,
        gmail_message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        subject TEXT,
        sender TEXT,
        received_date TEXT,
        ml_classification BOOLEAN,
        ml_confidence REAL,
        needs_review BOOLEAN DEFAULT 0,
        user_classification BOOLEAN,
        classified_at TIMESTAMP,
        reviewed_at TIMESTAMP,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'classified', 'reviewed', 'skipped', 'error')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for classification_queue
    console.log('Creating indexes for classification_queue...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_classification_queue_gmail_message_id ON classification_queue(gmail_message_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_classification_queue_status ON classification_queue(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_classification_queue_needs_review ON classification_queue(needs_review)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_classification_queue_thread_id ON classification_queue(thread_id)');
    
    // 3. Create training_feedback table
    console.log('Creating training_feedback table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS training_feedback (
        id TEXT PRIMARY KEY,
        gmail_message_id TEXT NOT NULL,
        subject TEXT,
        body TEXT,
        sender TEXT,
        received_date TEXT,
        ml_predicted_label BOOLEAN,
        ml_confidence REAL,
        human_label BOOLEAN NOT NULL,
        corrected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        corrected_by TEXT,
        exported BOOLEAN DEFAULT 0,
        exported_at TIMESTAMP,
        included_in_model_version TEXT,
        correction_reason TEXT,
        feature_hash TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for training_feedback
    console.log('Creating indexes for training_feedback...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_training_feedback_gmail_message_id ON training_feedback(gmail_message_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_training_feedback_exported ON training_feedback(exported)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_training_feedback_human_label ON training_feedback(human_label)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_training_feedback_corrected_at ON training_feedback(corrected_at)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_training_feedback_feature_hash ON training_feedback(feature_hash)');
    
    // 4. Create indexes for new jobs table columns
    console.log('Creating indexes for new jobs table columns...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_classification_status ON jobs(classification_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_needs_review ON jobs(needs_review)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_parse_status ON jobs(parse_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_reviewed_at ON jobs(reviewed_at)');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('Human-in-the-loop tables migration completed successfully');
    return { success: true };
    
  } catch (error) {
    console.error('Error adding human-in-the-loop tables:', error);
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

// Export for use in other modules
module.exports = { addHumanInLoopTables };

// Run if executed directly
if (require.main === module) {
  addHumanInLoopTables();
}