# OnlyJobs Desktop 💼

An AI-powered job application tracker that automatically syncs with Gmail, uses local AI to classify emails, and helps you manage your job search efficiently.

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/AndrewTing89/onlyjobs-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://sourceforge.net/projects/onlyjobs-desktop/)
[![Downloads](https://img.shields.io/sourceforge/dt/onlyjobs-desktop)](https://sourceforge.net/projects/onlyjobs-desktop/)
[![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![LLM Powered](https://img.shields.io/badge/LLM-Llama_3.2-00D4AA?logo=meta)](https://github.com/withcatai/node-llama-cpp)

## Features

- 🔐 **Gmail Integration**: Secure OAuth 2.0 authentication with multi-account support
- 🧵 **Thread-Aware Processing**: Gmail threads treated as single jobs (70-80% fewer LLM calls)
- 🤖 **Stateless 3-Stage LLM System**: Classification → Extraction → Smart Job Matching (no context exhaustion)
- ⚡ **Real-time Updates**: See job applications appear instantly during sync
- 📅 **Chronological Processing**: Processes oldest → newest for proper job timeline
- 🎯 **Smart Job Matching**: "Google SWE" intelligently matches "Google Software Engineer"
- 💾 **Local Processing**: All LLM inference runs locally - no external API calls
- 🔄 **Company Grouping**: Orphan emails grouped by company for efficient matching
- 📊 **Smart Dashboard**: Track applications with live updates and status progression
- ⚙️ **Customizable Prompts**: Configure Stage 1, 2, and 3 prompts per model
- 📈 **Performance Optimized**: Up to 85% reduction in processing time vs naive approach
- 📚 **5 LLM Models**: Choose from Llama, Qwen, Hermes, Phi, with per-stage prompts

## Prerequisites

- Node.js (v18 or higher)
- Gmail account
- Google Cloud Platform project with Gmail API enabled

## Email Processing Workflow

The app uses a sophisticated **Thread-Aware 3-Stage LLM System** for intelligent email processing:

### Processing Pipeline
1. **Gmail Fetch**: Retrieves emails with thread IDs
2. **Thread Grouping**: Groups related emails (80% are in threads)
3. **Chronological Sort**: Processes oldest → newest for proper timeline
4. **Smart Classification**: Only classifies first email per thread

### Three-Page Workflow (Human-in-the-Loop System)

#### Page 1: Fetch & Classify
- **Purpose**: Sync Gmail and classify emails as job-related or not
- **Speed**: ~1-2ms per email (ML Random Forest)
- **Process**: Digest filter → ML classification → Queue for review
- **Accuracy**: ~95% with continuous learning from user feedback

#### Page 2: Review Classifications
- **Purpose**: Human review and verification of ML classifications
- **Features**: Bulk operations, confidence indicators, training feedback
- **Output**: Approved emails move to extraction queue
- **Control**: User has final say on what's job-related

#### Page 3: Extract with LLM
- **Purpose**: Extract company, position, and status from approved emails
- **Speed**: ~1-2 seconds per email (local LLM)
- **Models**: 5 different models available (Llama, Qwen, Hermes, Phi)
- **Output**: Structured job data saved to database
- **Smart Matching**: Detects and merges duplicate job applications
  - "Software Engineer" vs "SWE" → same_job: true
  - "Senior Engineer" vs "Sr. Engineer" → same_job: true  
  - "Frontend Dev" vs "Backend Dev" → same_job: false

### Performance Benefits
- **Ultra-Fast Classification**: ML runs in 1-2ms vs 500ms for LLM
- **Human Accuracy**: User verification ensures 100% accuracy
- **Efficient Extraction**: LLM only runs on confirmed job emails
- **Thread Intelligence**: Groups related emails to reduce processing
- **Result**: 200x faster classification, perfect accuracy with human review

For complete technical details, see [EMAIL_PROCESSING_WORKFLOW.md](./EMAIL_PROCESSING_WORKFLOW.md)

### LLM Setup
- **Setup Commands**:
  - `npm run llm:deps` - Install node-llama-cpp dependencies
  - `npm run llm:download` - Download the model file
  - `npm run llm:test` - Test LLM classification with sample emails (runs under Electron)
  - `npm run llm:normalize -- --dry-run` - Preview normalization changes to existing job records
  - `npm run llm:normalize` - Apply normalization improvements to existing database records
- **Performance Features**:
  - **Two-tier Processing**: Prefiltering eliminates 60-70% of LLM calls
  - **Streaming Early Stop**: Terminates LLM generation as soon as complete JSON is detected (30-60% latency reduction)
  - **Single-shot Prompts**: Uses plain-string prompts instead of chat arrays for faster inference
  - **Smart Caching**: Results cached for 7 days (configurable TTL) for faster repeated classification  
  - **Timeout Protection**: Falls back to keyword classifier after 15s timeout
  - **Content Truncation**: Long emails truncated to 5000 chars (preserves header/footer)
  - **Concurrency Control**: Limits concurrent LLM requests to prevent resource exhaustion
- **Configuration**:
  - `ONLYJOBS_ENABLE_PREFILTER=1` - Enable/disable regex prefilter
  - `ONLYJOBS_INFER_TIMEOUT_MS=15000` - LLM inference timeout in milliseconds
  - `ONLYJOBS_EARLY_STOP_JSON=1` - Enable streaming early-stop for faster JSON completion
  - `ONLYJOBS_CACHE_TTL_HOURS=168` - Cache expiration (7 days default)
  - `ONLYJOBS_INFER_MAX_CHARS=5000` - Max email length before truncation
- **Database Normalization**:
  - Auto-detects database location in platform-specific userData directories
  - Custom path: `npm run llm:normalize -- --db="/path/to/jobs.db"`
  - Environment: `ONLYJOBS_DB_PATH="/path/to/jobs.db" npm run llm:normalize`
  - Re-applies subject-first extraction, vendor heuristics, and sanitizers to existing records
- **Troubleshooting**:
  - `npm run diagnose:native` - Diagnose native module loading issues
  - `npm run rebuild:llm` - Rebuild native modules for Electron
  - `npm run rebuild:llm:clean` - Clean rebuild from source if standard rebuild fails
  - Apple Silicon: Set `export LLAMA_METAL=1` and tune `ONLYJOBS_N_GPU_LAYERS` (e.g., 10)
  - If module keys are empty or `_llama` undefined:
    1. Try `npm run rebuild:llm`
    2. If still failing: `npm run rebuild:llm:clean`
- **Important**: 
  - Native modules are rebuilt for Electron, so manual tests MUST run under Electron with `ELECTRON_RUN_AS_NODE=1`
  - `node-llama-cpp` must never be imported in renderer/web code - Electron main process only

## Installation

### Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/AndrewTing89/onlyjobs-desktop.git
cd onlyjobs-desktop
```

2. **Install Node.js dependencies:**
```bash
npm install
```

3. **Set up LLM dependencies and model:**
```bash
# Install LLM native dependencies (required for classification)
npm run llm:deps

# Download the Llama model (this may take a few minutes)
npm run llm:download
```

4. **Configure Gmail API access:**
   
   **Option A: Manual Setup**
   - Download `gmail_credentials.json` from your Google Cloud Console
   - Place it in the project root directory
   - Create `.env` file in project root:
   ```bash
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret  
   GOOGLE_REDIRECT_URI=http://127.0.0.1:3001/auth/callback
   ```
   - Create `electron/.env` file:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=your_client_id
   GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
   GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:3001/auth/callback
   ```

   **Option B: Automated Setup**
   ```bash
   # Run the setup script to configure everything automatically
   bash setup.sh
   ```

5. **Verify installation:**
```bash
# Test LLM classification (optional but recommended)
npm run llm:test

# Start the application
npm start    # Terminal 1: React dev server
npm run electron-dev    # Terminal 2: Electron app
```

### Common Installation Issues

**LLM Model Download Fails:**
```bash
# Try rebuilding native dependencies first
npm run rebuild:llm
npm run llm:download
```

**Gmail Authentication Issues:**
- Ensure redirect URI uses `127.0.0.1` (not `localhost`)
- Verify Gmail API is enabled in Google Cloud Console
- Check that both `.env` files have identical OAuth credentials

**Native Module Errors:**
```bash
# For Apple Silicon Macs
export LLAMA_METAL=1
npm run rebuild:llm

# For other platforms
npm run rebuild:llm:clean
```

**First Time Setup:**
- After installation, the app will guide you through Gmail account connection
- Use the Settings panel to configure email fetch limits (default: 50 per account)
- LLM classification happens automatically during sync

## Running the App

### Development Mode

Start both React and Electron in development mode:

```bash
# Terminal 1 - Start React dev server
npm start

# Terminal 2 - Start Electron
npm run electron-dev
```

### Production Build

```bash
# Build React app
npm run build

# Package Electron app
npm run electron-pack
```

## Testing

Run the Jest test suite:

```bash
npm test
```

## Project Structure

```
onlyjobs-desktop/
├── electron/              # Electron main process files
│   ├── main.js           # Main entry point
│   ├── ipc-handlers.js   # IPC communication handlers with real-time events
│   ├── gmail-multi-auth.js # Multi-account Gmail authentication
│   ├── llm/              # Local LLM engine
│   │   ├── llmEngine.ts  # LLM inference engine with streaming
│   │   ├── config.ts     # Model configuration
│   │   └── rules.ts      # Status hint patterns
│   └── classifier/       # Classification providers
│       └── providerFactory.js # Pure LLM provider factory
├── src/                  # React app source
│   ├── components/       # React components
│   │   ├── JobsList.tsx  # Real-time job dashboard
│   │   ├── GmailMultiAccount.tsx # Multi-account management with settings
│   │   ├── EmailViewModal.tsx # Job email viewer
│   │   ├── MLStatusIndicator.tsx # Real-time ML/LLM status display
│   │   └── MLStatsCard.tsx # ML model statistics and training info
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx # Main dashboard page
│   │   ├── Settings.tsx  # App settings
│   │   └── About.tsx     # System documentation and flow
│   └── ElectronApp.tsx  # Main Electron app component
├── models/              # Local LLM models
│   └── model.gguf      # GGUF model file
├── scripts/            # Utility scripts
│   └── normalizeExisting.electron.js # Database normalization
└── public/             # Static assets
```

## Key Technologies

- **Frontend**: React 19, TypeScript, Material-UI
- **Desktop**: Electron 37
- **Database**: SQLite3 (better-sqlite3)
- **LLM**: node-llama-cpp with GGUF models
- **Authentication**: Google OAuth 2.0 (AppAuth-JS)

## Development Notes

### Gmail Sync Process

1. **OAuth Authentication**: Connect multiple Gmail accounts through secure OAuth flow
2. **Customizable Fetching**: Download configurable number of recent emails (1-1000 per account)
3. **Real-time LLM Classification**: Process emails through local language model with live UI updates
4. **Smart Data Extraction**: Extract company, position, status, dates, and sender information
5. **Instant Updates**: Jobs appear in UI immediately as they're found during sync
6. **Local Storage**: Save job-related emails to local SQLite database with proper deduplication

### Database Schema

The app uses SQLite with the following main tables:
- `jobs`: Stores classified job applications with extracted data (company, position, status, dates)
- `email_sync`: Tracks processed emails to prevent duplicates across multiple accounts
- `gmail_accounts`: Manages multiple Gmail account connections and sync status
- `sync_status`: Tracks overall sync progress and statistics
- `ml_feedback`: Stores user corrections for ML model training
- `llm_cache`: Caches classification results for 7-day TTL (configurable)

### LLM Classification

The system uses a Human-in-the-Loop workflow for perfect accuracy:
- **ML Classification**: Random Forest classifier (1-2ms) identifies job emails
- **Human Review**: User verifies and corrects ML classifications
- **LLM Extraction**: Local LLM extracts details from approved emails only
- **Thread-Aware**: Gmail threads processed as single jobs
- **Chronological Processing**: Always oldest → newest for proper job lifecycle
- **Structured Output**: Returns JSON with company, position, status
- **Real-time Updates**: Live progress tracking during sync
- **Privacy First**: All processing happens locally, no data sent to external APIs
- **Continuous Learning**: User feedback improves ML model over time

## ML Classifier & LLM Extraction

The system combines fast ML classification with accurate LLM extraction:

### ML Classifier (Random Forest)
- **Speed**: 1-2ms per email (200x faster than LLM)
- **Accuracy**: ~95% with continuous improvement from user feedback
- **Training**: Automatically retrains with user corrections
- **Features**: TF-IDF vectorization with job-related keywords

### LLM Extraction
- **When Used**: Only after human approval of classifications
- **Models**: 5 available (Llama 3.2, Qwen 2.5, Hermes 3, Phi 3.5)
- **Testing**: `npm run llm:test` - Test extraction on sample emails
- **Evaluation**: `npm run llm:evaluate` - Run systematic evaluation

### Configuration Tuning

- `ONLYJOBS_CTX=1024` - Context window size (tokens)
- `ONLYJOBS_MAX_TOKENS=128` - Max output tokens per inference
- `ONLYJOBS_N_GPU_LAYERS=0` - GPU acceleration layers (Metal/CUDA)
- `ONLYJOBS_INFER_TIMEOUT_MS=8000` - Timeout before fallback
- `ONLYJOBS_ENABLE_PREFILTER=0/1` - Toggle regex-based prefiltering

### Output Normalization

The system automatically normalizes LLM outputs:
- **Status Mapping**: "screening"→"Interview", "application received"→"Applied", "rejected"→"Declined", "verbal offer"→"Offer"
- **Text Cleaning**: Trims whitespace, removes quotes, collapses spaces
- **JSON Contract**: Strict schema validation with automatic field coercion

## User Interface Features

### Real-time Job Updates
- **Live Sync**: Jobs appear in the dashboard instantly as they're found during email processing
- **Progress Tracking**: Real-time sync progress with email counts and status updates
- **No Waiting**: See results immediately instead of waiting for full sync completion

### Gmail Account Management  
- **Multi-Account Support**: Connect and manage multiple Gmail accounts from a single interface
- **Account Status**: View connection status, last sync times, and per-account statistics
- **Easy Setup**: Simple OAuth flow for secure Gmail account connection

### Customizable Sync Settings
- **Email Fetch Limits**: Configure how many emails to fetch per sync (1-1000 per account)
- **Settings UI**: Collapsible settings panel with user-friendly controls
- **Performance Control**: Balance between sync speed and thoroughness

### Job Dashboard
- **Chronological Ordering**: Latest job applications appear first (newest dates at top)
- **Status Management**: Update job statuses with color-coded chips (Applied, Interviewed, Offer, Declined)
- **Search & Filter**: Find jobs quickly with real-time search functionality  
- **Job Details**: View sender information, application dates, and email source account
- **Clean Design**: Modern Material Design interface with intuitive navigation

### ML Status Indicator
- **Real-time Classification Display**: Shows when ML vs LLM is being used
- **Performance Metrics**: Track classification counts and confidence scores
- **Visual Feedback**: Color-coded indicators (green for ML, blue for LLM)
- **Statistics**: View ML accuracy, training sample count, and model performance

### About Page
- **System Flow Visualization**: Step-by-step breakdown of the classification pipeline
- **Database Schema**: Overview of all tables and their relationships
- **Performance Metrics**: 200x faster ML processing compared to LLM
- **Two-Tier Explanation**: Clear documentation of when each classifier is used

### Evaluation Metrics

The evaluator computes:
- Job classification accuracy (binary)
- Status classification accuracy (4-class + null)
- Macro-F1 score across status classes
- Latency distribution by decision path
- Decision path breakdown (cache_hit/prefilter_skip/llm_success/timeout_fallback)

## Troubleshooting

### Better-SQLite3 Issues

If you encounter module version mismatch errors:

```bash
# For Electron
npm rebuild better-sqlite3 --runtime=electron --target=37.2.5 --dist-url=https://electronjs.org/headers

# For Node.js (testing)
npm rebuild better-sqlite3
```

### OAuth Redirect Issues

Ensure redirect URIs use `127.0.0.1` (not `localhost`) as per Google's requirements.

### Email Content Display

HTML emails are automatically converted to plain text for better readability.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Local LLM processing powered by node-llama-cpp
- Built with Electron and React
- Gmail API integration powered by Google APIs
- GGUF model format support from llama.cpp community

