/**
 * Database migration to add thread support
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function addThreadSupport() {
  const appDir = path.join(os.homedir(), 'Library', 'Application Support', 'onlyjobs-desktop');
  const dbPath = path.join(appDir, 'jobs.db');
  const db = new Database(dbPath);
  
  try {
    // Check if columns already exist
    const tableInfo = db.pragma('table_info(jobs)');
    const columnNames = tableInfo.map(col => col.name);
    
    // Add thread_id column if it doesn't exist
    if (!columnNames.includes('thread_id')) {
      console.log('Adding thread_id column to jobs table...');
      db.exec(`ALTER TABLE jobs ADD COLUMN thread_id TEXT`);
      
      // Create index for thread_id
      db.exec(`CREATE INDEX IF NOT EXISTS idx_thread_id ON jobs(thread_id)`);
      console.log('Added thread_id column and index');
    } else {
      console.log('thread_id column already exists');
    }
    
    // Add email_thread_ids column if it doesn't exist (JSON array of all thread IDs)
    if (!columnNames.includes('email_thread_ids')) {
      console.log('Adding email_thread_ids column to jobs table...');
      db.exec(`ALTER TABLE jobs ADD COLUMN email_thread_ids TEXT`);
      console.log('Added email_thread_ids column');
    } else {
      console.log('email_thread_ids column already exists');
    }
    
    // Test tables removed - no longer needed
    
    console.log('Thread support migration completed successfully');
    return { success: true };
    
  } catch (error) {
    console.error('Error adding thread support:', error);
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

// Export for use in other modules
module.exports = { addThreadSupport };

// Run if executed directly
if (require.main === module) {
  addThreadSupport();
}