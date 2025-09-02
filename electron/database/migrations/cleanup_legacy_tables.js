/**
 * Migration to clean up legacy tables after pipeline simplification
 * These tables are no longer needed with the new email_pipeline architecture
 */

function cleanupLegacyTables(db) {
  console.log('Cleaning up legacy tables...');
  
  try {
    // Drop classification_queue table (replaced by email_pipeline)
    try {
      db.exec('DROP TABLE IF EXISTS classification_queue');
      console.log('Dropped classification_queue table');
    } catch (e) {
      console.log('classification_queue table does not exist or error dropping:', e.message);
    }

    // Drop training_feedback table (no longer needed)
    try {
      db.exec('DROP TABLE IF EXISTS training_feedback');
      console.log('Dropped training_feedback table');
    } catch (e) {
      console.log('training_feedback table does not exist or error dropping:', e.message);
    }

    // Drop email_review table (replaced by pipeline review)
    try {
      db.exec('DROP TABLE IF EXISTS email_review');
      console.log('Dropped email_review table');
    } catch (e) {
      console.log('email_review table does not exist or error dropping:', e.message);
    }

    // Drop indexes associated with old tables
    try {
      db.exec(`
        DROP INDEX IF EXISTS idx_classification_queue_account;
        DROP INDEX IF EXISTS idx_classification_queue_status;
        DROP INDEX IF EXISTS idx_classification_queue_parse_status;
        DROP INDEX IF EXISTS idx_classification_queue_needs_review;
        DROP INDEX IF EXISTS idx_classification_queue_thread;
      `);
      console.log('Dropped old indexes');
    } catch (e) {
      console.log('Error dropping indexes:', e.message);
    }

    console.log('Legacy tables cleanup completed');
    return true;
  } catch (error) {
    console.error('Error cleaning up legacy tables:', error);
    return false;
  }
}

module.exports = {
  cleanupLegacyTables
};