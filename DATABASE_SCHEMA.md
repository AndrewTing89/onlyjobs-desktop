# OnlyJobs Database Schema Documentation

## Overview

This document records the complete database schema for the OnlyJobs application, including the improved unified pipeline design that separates workflow stages from classification methods.

**Last Updated:** January 2, 2025  
**Schema Version:** Unified Pipeline (v2)  
**Migration:** `improve_pipeline_schema.js`

---

## New Unified Pipeline Schema

### email_pipeline (Primary Table)

**Purpose:** Unified table with clean separation of workflow stages vs classification methods

```sql
CREATE TABLE email_pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  account_email TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  plaintext TEXT NOT NULL,                    -- Email content (text)
  body_html TEXT,                             -- Email content (HTML)
  date_received TEXT NOT NULL,                -- When email was received
  
  -- ML Classification results
  ml_classification TEXT,                     -- JSON string of classification result
  job_probability REAL DEFAULT 0,            -- 0-1 probability score (unified confidence)
  is_job_related BOOLEAN DEFAULT 0,
  
  -- Pipeline workflow stages
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
  jobs_table_id TEXT,                         -- FK to jobs table if promoted
  needs_review BOOLEAN DEFAULT 0,
  review_reason TEXT,
  user_feedback TEXT,
  
  -- User review tracking  
  user_classification TEXT,                   -- 'HIL_approved', 'HIL_rejected', etc.
  reviewed_at TEXT,
  reviewed_by TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes for Performance

```sql
CREATE INDEX idx_email_pipeline_gmail_id ON email_pipeline(gmail_message_id);
CREATE INDEX idx_email_pipeline_account ON email_pipeline(account_email);
CREATE INDEX idx_email_pipeline_stage ON email_pipeline(pipeline_stage);
CREATE INDEX idx_email_pipeline_method ON email_pipeline(classification_method);
CREATE INDEX idx_email_pipeline_job_related ON email_pipeline(is_job_related);
CREATE INDEX idx_email_pipeline_needs_review ON email_pipeline(needs_review);
CREATE INDEX idx_email_pipeline_probability ON email_pipeline(job_probability);
CREATE INDEX idx_email_pipeline_user_class ON email_pipeline(user_classification);
CREATE INDEX idx_email_pipeline_thread ON email_pipeline(thread_id);
CREATE INDEX idx_email_pipeline_date ON email_pipeline(date_received);
```

---

## Field Mappings (Old → New)

### Critical Field Name Changes:

| **Old Field** | **New Field** | **Type** | **Purpose** |
|---------------|---------------|----------|-------------|
| `body` | `plaintext` | TEXT | Email content (text format) |
| `email_date` | `date_received` | TEXT | When email was received |  
| `confidence` | `job_probability` | REAL | 0-1 probability score |
| `human_verified` | `user_classification` | TEXT | HIL review status |

### API Response Standardization:

**Before (Confusing Aliases):**
```sql
ep.plaintext as body,                    -- Handler 1
ep.date_received as email_date,          -- Handler 1  
ep.date_received as received_date,       -- Handler 2
ep.confidence as job_probability         -- Old field name
```

**After (Direct Schema Names):**
```sql  
ep.plaintext,                            -- Direct field name
ep.date_received,                        -- Direct field name
ep.job_probability                       -- Direct field name
```

---

## Supporting Tables

### jobs (Final Job Applications)

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  gmail_message_id TEXT NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT DEFAULT 'Applied' CHECK(status IN ('Applied', 'Interviewed', 'Declined', 'Offer')),
  applied_date DATE,
  location TEXT,
  salary_range TEXT,
  notes TEXT,
  job_probability REAL,                   -- Unified confidence field
  account_email TEXT,
  from_address TEXT,
  thread_id TEXT,                         -- Thread grouping
  email_thread_ids TEXT,                  -- JSON array of email IDs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gmail_message_id, account_email)
);
```

### email_sync (Processed Email Tracking)

```sql
CREATE TABLE email_sync (
  gmail_message_id TEXT,
  account_email TEXT NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_job_related BOOLEAN DEFAULT 0,
  PRIMARY KEY (gmail_message_id, account_email)
);
```

### sync_history (Enhanced with Date Ranges)

```sql  
CREATE TABLE sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accounts_synced INTEGER,
  emails_fetched INTEGER,
  emails_processed INTEGER,
  emails_classified INTEGER DEFAULT 0,      -- NEW
  jobs_found INTEGER,
  new_jobs INTEGER DEFAULT 0,               -- NEW
  updated_jobs INTEGER DEFAULT 0,           -- NEW
  duration_ms INTEGER,
  status TEXT DEFAULT 'success',            -- NEW
  date_from TEXT,                           -- NEW: Sync start date
  date_to TEXT,                             -- NEW: Sync end date  
  days_synced INTEGER,                      -- NEW: Calculated days
  success BOOLEAN DEFAULT 1,
  error_message TEXT
);
```

### Other Core Tables

```sql
-- Gmail account management
CREATE TABLE gmail_accounts (
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
);

-- Sync progress tracking
CREATE TABLE sync_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_fetch_time TIMESTAMP,
  last_classify_time TIMESTAMP,
  last_sync_status TEXT,
  total_emails_fetched INTEGER DEFAULT 0,
  total_emails_classified INTEGER DEFAULT 0,
  total_jobs_found INTEGER DEFAULT 0
);

-- LLM result caching (7-day TTL)
CREATE TABLE llm_cache (
  id TEXT PRIMARY KEY,
  input_hash TEXT UNIQUE NOT NULL,
  stage INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  result TEXT NOT NULL,
  confidence REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Model-specific prompts
CREATE TABLE model_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL,
  stage INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_name, stage)
);
```

---

## Migration History

### improve_pipeline_schema.js (Current)

**Purpose:** Create unified pipeline design separating workflow stages from classification methods

**Key Changes:**
- Clean pipeline stages: `fetched → classified → ready_for_extraction → extracted → in_jobs`
- Separate classification methods: `digest_filter`, `ml`, `llm`, `human`, `rule_based`
- Unified `job_probability` field (replaces fragmented confidence scoring)
- Human-in-the-loop tracking with `user_classification`
- Field name standardization: `plaintext`, `date_received`

**Migration Process:**
1. Create `email_pipeline_improved` table with new schema
2. Skip data migration (fresh sync will populate)
3. Drop old `email_pipeline` table
4. Rename new table to `email_pipeline`
5. Create optimized indexes

### Previous Migrations

- `add_email_pipeline.js` - Created original pipeline system (deprecated)
- `add_human_in_loop_tables.js` - Added HIL review system
- `cleanup_legacy_tables.js` - Removed deprecated tables

---

## Confidence Scoring System

### Unified Configuration

All confidence scoring uses centralized thresholds:

- **0.0-0.3**: Very Low - Needs review, high uncertainty
- **0.3-0.5**: Low - Needs review, moderate uncertainty  
- **0.5-0.7**: Medium - Optional review, moderate confidence
- **0.7-0.9**: High - Can auto-approve, high confidence
- **0.9-1.0**: Very High - Auto-approve, very high confidence

### Functional Thresholds

- **Needs Review**: < 0.7 (requires human verification)
- **Auto-Approve**: ≥ 0.9 (can skip human review)
- **Min Job Storage**: ≥ 0.6 (minimum confidence to store as job)

---

## TypeScript Interface Alignment

### EmailClassification Interface

```typescript
export interface EmailClassification {
  id: string;
  gmail_message_id: string;
  thread_id?: string;
  subject: string;
  from_address: string;
  plaintext: string;                      // Matches DB field
  body_html?: string;
  date_received: string;                  // Matches DB field
  account_email: string;
  
  // ML Classification results
  ml_classification?: string;
  job_probability: number;                // Unified confidence field
  is_job_related: boolean;
  is_classified: boolean;
  
  // Pipeline workflow stages
  pipeline_stage: 'fetched' | 'classified' | 'ready_for_extraction' | 'extracted' | 'in_jobs';
  classification_method?: 'digest_filter' | 'ml' | 'llm' | 'human' | 'rule_based';
  
  // User review tracking
  user_classification?: 'HIL_approved' | 'HIL_rejected';
  reviewed_at?: string;
  reviewed_by?: string;
  
  // Processing metadata
  created_at: string;
  updated_at: string;
}
```

---

## Backup Information

**Database File Location:** `~/Library/Application Support/onlyjobs-desktop/jobs.db`

**To Reset Schema:**
```bash
# Close Electron app, then:
rm ~/Library/Application\ Support/onlyjobs-desktop/jobs.db

# App restart will create fresh schema from this documentation
```

**Schema Creation Order:**
1. Database initialization runs (`db-init.js`)
2. Core tables created with new schema
3. Migration runs (`improve_pipeline_schema.js`)  
4. Indexes created for performance
5. Fresh sync populates with clean data

---

## Notes

- **Human-in-the-Loop System**: ML classification → human review → LLM extraction
- **Thread-Aware Processing**: Groups emails by Gmail thread for efficient job matching  
- **Performance**: ML at 1-2ms, LLM at 1-2s (200x speed difference)
- **Data Flow**: Gmail → Digest Filter → ML Classify → Human Review → LLM Extract → Jobs Table