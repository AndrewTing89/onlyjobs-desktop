/**
 * Enhanced Database Schema for Record Origin Tracking and LLM Metadata
 * Supports manual record creation and editing alongside automatic LLM processing
 */

const ENHANCED_SCHEMA_SQL = `
-- Enhanced job_applications table with record origin tracking
ALTER TABLE job_applications ADD COLUMN record_source TEXT DEFAULT 'llm_auto' 
  CHECK(record_source IN ('llm_auto', 'manual_created', 'manual_edited', 'hybrid'));

-- Track LLM processing metadata
ALTER TABLE job_applications ADD COLUMN llm_processed BOOLEAN DEFAULT 0;
ALTER TABLE job_applications ADD COLUMN llm_confidence REAL DEFAULT NULL;
ALTER TABLE job_applications ADD COLUMN llm_model_version TEXT DEFAULT NULL;
ALTER TABLE job_applications ADD COLUMN original_classification TEXT DEFAULT NULL; -- JSON of original LLM result

-- Track edit history and user modifications
CREATE TABLE IF NOT EXISTS job_edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edit_source TEXT CHECK(edit_source IN ('llm_auto', 'manual_user', 'llm_reprocess')),
  editor_context TEXT, -- JSON with edit context/reason
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
);

-- Enhanced email processing cache with source awareness
CREATE TABLE IF NOT EXISTS llm_email_cache (
  cache_key TEXT PRIMARY KEY,
  email_subject TEXT,
  email_from TEXT,
  content_hash TEXT,
  classification_result TEXT, -- JSON
  model_version TEXT,
  confidence_score REAL,
  processing_time_ms INTEGER,
  record_source TEXT DEFAULT 'llm_auto',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+30 days'))
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_record_source ON job_applications(record_source);
CREATE INDEX IF NOT EXISTS idx_llm_processed ON job_applications(llm_processed);
CREATE INDEX IF NOT EXISTS idx_edit_source ON job_edit_history(edit_source);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON llm_email_cache(expires_at);
`;

/**
 * Record Origin Types
 */
const RECORD_SOURCES = {
  LLM_AUTO: 'llm_auto',          // Automatically created/updated by LLM
  MANUAL_CREATED: 'manual_created', // Manually created by user
  MANUAL_EDITED: 'manual_edited',   // LLM-created but user-edited
  HYBRID: 'hybrid'                  // Mix of manual and automatic data
};

/**
 * Edit Source Types for tracking what triggered changes
 */
const EDIT_SOURCES = {
  LLM_AUTO: 'llm_auto',        // Automatic LLM processing
  MANUAL_USER: 'manual_user',   // Direct user edit
  LLM_REPROCESS: 'llm_reprocess' // LLM reprocessing after user edit
};

/**
 * Field-level metadata for tracking mixed sources
 */
const FIELD_METADATA_SCHEMA = {
  company: {
    source: 'llm_auto|manual_user',
    confidence: 0.95,
    last_modified: '2024-01-01T00:00:00Z',
    original_llm_value: 'Google Inc.',
    user_override: false
  },
  position: {
    source: 'manual_user',
    confidence: 1.0,
    last_modified: '2024-01-01T00:00:00Z',
    original_llm_value: 'Software Engineer II',
    user_override: true
  }
  // ... other fields
};

/**
 * Enhanced job record structure with metadata
 */
const ENHANCED_JOB_RECORD = {
  // Original fields
  job_id: 'string',
  company: 'string',
  position: 'string',
  status: 'string',
  location: 'string',
  
  // New metadata fields
  record_source: RECORD_SOURCES.LLM_AUTO,
  llm_processed: true,
  llm_confidence: 0.92,
  llm_model_version: 'llama-3.1-8b-2024',
  original_classification: '{"is_job_related": true, "company": "Google", ...}',
  
  // Field-level metadata (JSON)
  field_metadata: {
    company: FIELD_METADATA_SCHEMA.company,
    position: FIELD_METADATA_SCHEMA.position
  },
  
  // Tracking
  created_at: 'datetime',
  updated_at: 'datetime',
  last_llm_processed: 'datetime'
};

module.exports = {
  ENHANCED_SCHEMA_SQL,
  RECORD_SOURCES,
  EDIT_SOURCES,
  FIELD_METADATA_SCHEMA,
  ENHANCED_JOB_RECORD
};