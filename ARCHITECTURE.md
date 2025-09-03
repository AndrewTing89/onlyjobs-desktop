# OnlyJobs Desktop Architecture Overview

## High-Level System Architecture

OnlyJobs is a sophisticated AI-powered job application tracking desktop application built with a Human-in-the-Loop (HIL) approach that combines ultra-fast ML classification with human verification and local LLM extraction.

### Core Architecture Principles
- **Speed First**: ML classification (1-2ms) for initial screening
- **Human Authority**: User has final say on all classifications  
- **Quality Content**: Multi-layered email parsing for clean, readable content
- **Local Processing**: All AI/ML processing happens locally (no external APIs)
- **Thread-Aware**: Intelligent email grouping for better job matching

## System Flow Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Gmail API     │    │   Email Parser   │    │  Digest Filter  │
│  (Multi-Auth)   │───▶│ (RAW Fallback)   │───▶│  (Newsletter    │
│                 │    │                  │    │   Detection)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐             ▼
│   Human Review  │◀───│  ML Classifier   │    ┌─────────────────┐
│ (Classification │    │ (Random Forest)  │◀───│  Classification │
│    Page)        │    │    ~1-2ms        │    │   Only Sync     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               
         ▼                                               
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Approved Emails │───▶│  LLM Extraction  │───▶│   Jobs Table    │
│   (HIL Queue)   │    │   (5 Models)     │    │  (Final Jobs)   │
│                 │    │    ~1-2sec       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Data Workflow

### 1. Gmail Ingestion
```typescript
GmailMultiAuth → EmailParser → ClassificationOnlyProcessor
```
- **Multi-account OAuth**: Support for multiple Gmail accounts
- **Thread-aware fetching**: Groups related emails by thread ID
- **Smart date filtering**: Configurable sync date ranges

### 2. Content Extraction (Multi-Layered)
```typescript
parseGmailMessage() → extractCleanPlaintext() → [RAW Fallback if needed]
```

**Standard Processing:**
- MIME multipart parsing
- HTML-to-text conversion
- Quoted-printable decoding

**RAW Fallback (for LinkedIn rejections):**
- Detects truncated LinkedIn content
- Fetches RAW email format
- Quality-over-length content prioritization
- Clean rejection message extraction

### 3. Classification Pipeline
```typescript
DigestFilter → MLClassifier → PipelineStorage → HIL Review
```
- **Digest Detection**: Remove newsletters, job alerts, spam
- **ML Classification**: Ultra-fast Random Forest (TF-IDF features)
- **Confidence Scoring**: 0.0-1.0 probability scale
- **Review Queue**: Emails needing human verification

### 4. Human Review Process
```typescript
ClassificationReview → UserFeedback → ApprovedQueue
```
- **Bulk Operations**: Approve/reject multiple emails
- **Visual Indicators**: Color-coded confidence levels  
- **Email Preview**: Modal dialog for content review
- **Training Feedback**: User decisions improve ML model

### 5. LLM Extraction
```typescript
ApprovedEmails → LLMExtractor → JobMatching → JobsTable
```
- **5 Model Options**: Llama, Qwen, Hermes, Phi, etc.
- **Context Window**: 1024 tokens for extraction
- **Structured Output**: JSON with company, position, status
- **Duplicate Detection**: Smart job matching and merging

## Database Schema

### Core Tables

#### `email_pipeline` (Main Processing Table)
```sql
CREATE TABLE email_pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  account_email TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  plaintext TEXT NOT NULL,           -- Clean extracted content
  body_html TEXT,
  date_received TEXT NOT NULL,
  
  -- ML Classification Results
  ml_classification TEXT,            -- JSON classification details
  job_probability REAL DEFAULT 0,   -- 0-1 confidence score
  is_job_related BOOLEAN DEFAULT 0,
  
  -- Pipeline State Management
  pipeline_stage TEXT DEFAULT 'fetched' CHECK(pipeline_stage IN (
    'fetched',              -- Email retrieved from Gmail
    'classified',           -- Classification complete
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
  
  -- Human Review Tracking
  user_classification TEXT,          -- 'HIL_approved', 'HIL_rejected'
  needs_review BOOLEAN DEFAULT 0,
  review_reason TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  
  -- Metadata
  jobs_table_id TEXT,               -- FK to jobs table if promoted
  user_feedback TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `jobs` (Final Job Applications)
```sql  
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'Applied', 'Interview', 'Offer', 'Declined'
  thread_id TEXT,                   -- Gmail thread for grouping
  email_thread_ids TEXT,            -- JSON array of related email IDs
  application_date TEXT,
  last_contact_date TEXT,
  location TEXT,
  salary TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### Supporting Tables
- **`gmail_accounts`**: Multi-account OAuth management
- **`email_sync`**: Duplicate prevention and sync tracking  
- **`sync_status`**: Real-time sync progress tracking
- **`sync_history`**: Historical sync records with performance metrics
- **`llm_cache`**: Classification result caching (7-day TTL)
- **`model_prompts`**: Model-specific extraction prompts

### Key Indexes
```sql
-- Performance indexes for common queries
CREATE INDEX idx_email_pipeline_stage ON email_pipeline(pipeline_stage);
CREATE INDEX idx_email_pipeline_method ON email_pipeline(classification_method);
CREATE INDEX idx_email_pipeline_composite ON email_pipeline(pipeline_stage, is_classified, needs_review);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_thread ON jobs(thread_id);
```

## IPC Communication Architecture

### IPC Handler Categories (`electron/ipc-handlers.js`)

#### 1. Gmail Integration
```typescript
// Multi-account authentication
'gmail:get-accounts' → getAllAccounts()
'gmail:add-account' → authenticateAccount() 
'gmail:remove-account' → removeAccount()

// Email synchronization  
'sync:classify-only' → startClassificationSync()
'sync:get-status' → getSyncStatus()
'sync:cancel' → cancelSync()
```

#### 2. Database Operations
```typescript
// Pipeline data queries
'db:get-pipeline-emails' → getPipelineEmails()
'db:update-email-classification' → updateClassification()
'db:get-review-stats' → getReviewStatistics()

// Job management
'db:get-jobs' → getJobs()
'db:create-job' → createJob()
'db:update-job' → updateJob()
```

#### 3. ML & Classification
```typescript
// ML classifier operations
'ml:classify-email' → classifyEmail()
'ml:get-stats' → getMLStats()
'ml:clear-cache' → clearMLCache()

// Human feedback
'ml:submit-feedback' → submitTrainingFeedback()
```

#### 4. LLM Operations
```typescript  
// Model management
'llm:get-models' → getAvailableModels()
'llm:test-extraction' → testExtraction()
'llm:extract-batch' → extractJobDetails()

// Configuration
'llm:get-config' → getLLMConfig()
'llm:update-prompts' → updateExtractionPrompts()
```

#### 5. Real-time Events
```typescript
// Activity streaming
sendActivity(type, data) → 'sync-activity' event
sendProgress(progress) → 'sync-progress' event

// Status updates
'db-updated' → Database change notifications
'sync-complete' → Sync completion events
```

### IPC Security & Error Handling
- **Input Validation**: All IPC parameters validated
- **Error Boundaries**: Comprehensive try-catch with logging
- **Rate Limiting**: Prevents UI spam of expensive operations
- **Session Management**: Handles Electron app lifecycle

## Component Architecture

### Frontend Structure (`src/`)

#### Core Pages
```typescript
Dashboard.tsx           // Main job tracking dashboard with real-time updates
ClassificationReview.tsx // HIL review interface with bulk operations
ExtractionPage.tsx     // LLM extraction management and monitoring  
GmailFetchPage.tsx     // Sync configuration and status
Settings.tsx           // Application settings and preferences
```

#### Key Components
```typescript
JobsList.tsx           // Real-time job dashboard with filtering
GmailMultiAccount.tsx  // Multi-account management UI
EmailViewModal.tsx     // Email content preview modal
ModelSelector.tsx      // LLM model selection interface
ConfidenceIndicator.tsx // Visual confidence scoring
```

#### State Management
```typescript
ElectronAuthContext.tsx // Gmail authentication state
useElectronIPC()       // Custom hook for IPC communication
useRealtimeUpdates()   // Real-time database change handling
```

### Backend Structure (`electron/`)

#### Core Processors
```typescript
classification-only-processor.js  // Main email processing pipeline
thread-aware-processor.js        // Advanced thread grouping (legacy)
ml-classifier-bridge.js          // ML model interface
digest-detector.js               // Newsletter/spam detection
```

#### Gmail Integration  
```typescript
gmail-multi-auth.js             // Multi-account OAuth management
gmail-batch-fetcher.js         // Efficient email fetching
email-parser.js               // MIME parsing and content extraction
```

#### LLM System
```typescript
llm/two-stage-classifier.js    // LLM extraction orchestrator
llm/config.js                  // Model configurations
llm/model-preloader.js         // Startup model preloading
model-manager.js               // Model download and management
```

#### Database Layer
```typescript
database/migrations/            // Schema evolution scripts
database-manager.js            // SQLite connection management
sync-history-manager.js        // Historical sync tracking
```

## Performance Characteristics

### Speed Benchmarks
- **ML Classification**: 1-2ms per email (200x faster than LLM)
- **Email Parsing**: ~50ms per email (with RAW fallback)
- **LLM Extraction**: ~1-2 seconds per email
- **Overall Throughput**: ~3-4 emails/second end-to-end

### Scalability Features
- **Batch Processing**: Process 100s of emails efficiently
- **Intelligent Caching**: 7-day ML result cache, 5-minute content cache
- **Progressive Loading**: UI updates during long operations
- **Memory Management**: Efficient SQLite connection pooling
- **Background Processing**: Non-blocking sync operations

### Quality Assurance
- **Content Accuracy**: Multi-layered parsing with RAW fallback
- **Human Oversight**: 100% accuracy through HIL review
- **Continuous Learning**: ML model improves from user feedback
- **Thread Awareness**: Smart duplicate detection and job matching
- **Robust Error Handling**: Graceful degradation and recovery

## Recent Improvements

### RAW Email Extraction System
- **Problem Solved**: LinkedIn rejection emails showing truncated footer content
- **Solution**: Quality-over-length RAW format fallback
- **Impact**: Clean, readable rejection messages (318/263 chars vs 2174/2157 chars)
- **Implementation**: Enhanced `classification-only-processor.js` with intelligent content prioritization

### Enhanced MIME Parsing
- **Multipart Message Support**: Complex email structure handling
- **Encoding Support**: Quoted-printable decoding (=3D, =20, etc.)
- **Content Filtering**: Smart boundary detection and extraction
- **Fallback Mechanisms**: Multiple parsing strategies for robustness

This architecture provides a robust, scalable, and user-friendly foundation for AI-powered job application tracking with emphasis on accuracy, performance, and user control.