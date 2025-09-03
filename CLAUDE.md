# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyJobs is an AI-powered job application tracking desktop application built with Electron, React, and TypeScript. It automatically syncs with Gmail, uses ML classification with human review followed by local LLM extraction to accurately track job applications, and provides real-time analytics.

📖 **For comprehensive system architecture, database schema, IPC handlers, and workflow documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md)**

## Common Development Commands

### Development
```bash
npm install                 # Install dependencies (use --legacy-peer-deps if needed)
npm start                   # Start React dev server on http://localhost:3000
npm run electron-dev       # Start Electron in development mode (run in separate terminal)
npm run dev:all           # Run both React and Electron concurrently
npm test                   # Run Jest tests
```

### Building & Packaging
```bash
npm run build              # Production build of React app
npm run dist              # Build Electron app without publishing
npm run dist:mac-arm      # Build for macOS ARM64
npm run dist:mac-intel    # Build for macOS x64
npm run dist:win          # Build for Windows
```

### LLM Setup & Testing
```bash
npm run llm:deps          # Install node-llama-cpp dependencies
npm run llm:download      # Download LLM models (5 models available)
npm run llm:test          # Test LLM extraction (runs under Electron)
npm run llm:evaluate      # Run systematic evaluation against fixtures
npm run llm:normalize     # Apply normalization to existing database records
```

### Native Module Management
```bash
npm run diagnose:native   # Diagnose native module loading issues
npm run rebuild:llm       # Rebuild LLM native modules for Electron
npm run rebuild:llm:clean # Clean rebuild from source if standard rebuild fails
npm run rebuild:native    # Rebuild all native modules (better-sqlite3 & node-llama-cpp)
```

## High-Level Architecture

### Desktop Application Stack
- **Electron Main Process** (`electron/main.js`): Manages app lifecycle, windows, and IPC
- **React Frontend** (`src/`): TypeScript-based SPA with Material-UI v7
- **Human-in-the-Loop Classification System**:
  - **ML Classifier**: Ultra-fast Random Forest (1-2ms) for initial classification
  - **Human Review**: Manual verification page for ML classifications
  - **LLM Extraction**: Extract details only from human-approved emails (~1-2s)
  - **Architecture**: Clear separation between classification (ML) and extraction (LLM)
  - **Performance**: 200x faster classification with ML, perfect accuracy with human review
  - **Models**: 5 LLM models for extraction, customizable prompts via UI
- **Database**: SQLite via better-sqlite3 (stored in userData directory)
- **Authentication**: AppAuth-JS for Gmail OAuth (NO Firebase - see RULES.md)

### Key Electron Components
1. **IPC Handlers** (`electron/ipc-handlers.js`): Real-time event-based communication
2. **Gmail Integration** (`electron/gmail-multi-auth.js`): Multi-account OAuth and email fetching with thread IDs
3. **Thread-Aware Processor** (`electron/thread-aware-processor.js`): Groups emails by thread for efficiency
4. **ML Classifier** (`electron/ml-classifier.js`): Random Forest classifier for fast initial classification
5. **LLM Extractor** (`electron/llm/two-stage-classifier.js`): Extracts details from approved emails
6. **LLM Config** (`electron/llm/config.js`): Model configurations and context sizes
6. **Model Manager** (`electron/model-manager.js`): Manages multiple LLM models and downloads
7. **Model Preloader** (`electron/llm/model-preloader.js`): Preloads models at startup for faster first sync

### Frontend Architecture
- **Components** (`src/components/`): Reusable UI components
  - `JobsList.tsx`: Real-time job dashboard with live updates
  - `GmailMultiAccount.tsx`: Multi-account management with settings UI
  - `EmailViewModal.tsx`: Job email viewer
- **Pages** (`src/pages/`): Route-level components
  - `Dashboard.tsx`: Main job tracking dashboard
  - `Settings.tsx`: Application settings
  - `About.tsx`: Comprehensive system documentation and flow visualization
  - `PromptEditor.tsx`: Model selection for prompt configuration
  - `ModelTestingPage.tsx`: Model management and testing dashboard
  - `models/BaseModelPage.tsx`: Reusable base for model-specific pages
  - `models/[Model]Page.tsx`: Individual model testing pages (5 models)
- **Context** (`src/contexts/ElectronAuthContext.tsx`): Authentication state management (NOT AuthContext)
- **Types** (`src/types/`): TypeScript type definitions

## Important Development Patterns

### Material-UI v7 Grid Component
**CRITICAL**: Always use the standard Grid component from '@mui/material/Grid'
- **Correct Import**: `import Grid from '@mui/material/Grid';`
- **NEVER USE**: `import Grid2` or `import { Grid2 }` - Grid2 doesn't exist in MUI v7
- **Props**: Use `size` prop, not `item` or individual breakpoint props
- **Example**: `<Grid size={{ xs: 12, md: 6 }}>` for responsive layouts
- See RULES.md for complete Grid component documentation and why this matters

### Environment Configuration
- Root `.env`: React app environment variables
- `electron/.env`: Electron main process OAuth credentials
- Both must have matching Google OAuth credentials

### Email Processing Architecture

#### Processor Types
The application uses two specialized processors for different sync scenarios:

1. **ThreadAwareProcessor** (`electron/thread-aware-processor.js`)
   - **Used by**: `gmail:sync-all` (full sync with LLM extraction)
   - **Purpose**: Groups emails by thread for efficient job matching
   - **Features**: Full LLM extraction, thread-aware deduplication
   - **Performance**: Slower but more accurate for comprehensive processing

2. **ClassificationOnlyProcessor** (`electron/processors/classification-only-processor.js`)  
   - **Used by**: `sync:classify-only` (ML-only sync)
   - **Purpose**: Fast ML classification without LLM extraction
   - **Features**: Pipeline system, digest filtering, HIL review
   - **Performance**: 200x faster, human review for accuracy

#### Database Migrations
Migration system automatically evolves database schema:
- `add_email_pipeline.js`: Creates the main pipeline system tables (deprecated)
- `add_human_in_loop_tables.js`: Adds HIL review system tables  
- `cleanup_legacy_tables.js`: Removes deprecated tables
- **`improve_pipeline_schema.js`**: NEW - Clean schema separating pipeline stages from classification methods

### Email Processing Flow (Human-in-the-Loop System)

#### Architecture Philosophy
- **ML First**: Ultra-fast Random Forest classifier for initial pass
- **Human Verification**: User reviews and corrects ML classifications
- **LLM for Extraction**: Local LLM only processes human-approved emails
- **Continuous Learning**: User feedback improves ML model over time
- **Thread-Aware**: Groups emails by thread for better job matching

#### Processing Pipeline
```
Gmail Fetch → Digest Filter → ML Classification (1-2ms) →
  ├─ Page 1: Fetch & Classify (automated)
  ├─ Page 2: Review Classifications (human review)
  └─ Page 3: Extract with LLM (only approved emails)
```

#### Page 1: Fetch & Classify
- **Purpose**: Sync Gmail and classify emails
- **Gmail Content Extraction**: Multi-layered approach for clean content
  - **Standard MIME Parsing**: Extract content from Gmail JSON API
  - **Enhanced Multipart Handling**: Process complex email structures
  - **RAW Format Fallback**: For incomplete LinkedIn rejection emails
  - **Quality over Length Logic**: Prioritize clean rejection messages over truncated footer content
  - **Quoted-Printable Decoding**: Handle email encoding (=3D, =20, etc.)
- **Digest Filter**: Removes newsletters, job boards, spam
- **ML Classifier**: Random Forest with TF-IDF features
- **Speed**: ~1-2ms per email (200x faster than LLM)
- **Accuracy**: ~95% with continuous improvement
- **Output**: Emails queued for human review

#### Page 2: Review Classifications  
- **Purpose**: Human verification of ML classifications
- **Features**: 
  - Bulk approve/reject operations
  - Confidence indicators (color-coded)
  - Email preview in modal dialog
  - Training feedback collection
- **Control**: User has final say on classifications
- **Output**: Approved emails move to extraction queue

#### Page 3: Extract with LLM
- **Purpose**: Extract job details from approved emails
- **Models**: 5 available (Llama, Qwen, Hermes, Phi)
- **Speed**: ~1-2 seconds per email
- **Context Size**: 1024 tokens for extraction
- **Output**: `{"company": "X", "position": "Y", "status": "Applied/Interview/Offer/Declined"}`
- **Job Matching**: Detects and merges duplicate applications

#### Performance Benefits
- **200x Faster Classification**: ML at 1-2ms vs LLM at 500ms
- **Perfect Accuracy**: Human review ensures no false positives/negatives
- **Efficient LLM Usage**: Only processes confirmed job emails
- **Continuous Improvement**: ML model learns from user feedback
- **Scalable**: Can process thousands of emails quickly
- **Memory Efficient**: ML model uses minimal resources

### Database Schema (Unified Pipeline Design)
- **`email_pipeline`**: New unified table with clean separation of workflow stages vs classification methods
  - **`pipeline_stage`**: Workflow position (fetched, classified, ready_for_extraction, extracted, in_jobs)
  - **`classification_method`**: How classified (digest_filter, ml, llm, human, rule_based)
  - **`is_classified`**: Boolean indicating if classification is complete
  - **`job_probability`**: Unified 0-1 confidence score (replaces fragmented confidence fields)
  - **`user_classification`**: Human review decisions (HIL_approved, HIL_rejected)
  - **`ml_classification`**: JSON of ML classification details for debugging
- `jobs`: Final job applications (company, position, status, dates, **thread_id**, **email_thread_ids**)
- `email_sync`: Processed email tracking (prevents duplicates)
- `gmail_accounts`: Multi-account management
- `sync_status`: Sync progress tracking  
- `sync_history`: Enhanced with date ranges (date_from, date_to, days_synced, emails_classified)
- `llm_cache`: Classification result caching (7-day TTL)
- `model_prompts`: Model-specific Stage 1, Stage 2, and Stage 3 prompts

#### Migration Notes
- The new schema migration (`improve_pipeline_schema.js`) creates a clean table structure
- Separates pipeline workflow stages from classification methods for cleaner design
- Skips data migration as requested - fresh sync will populate new schema
- Old pipeline stages like 'digested' are replaced with clean 'classified' stage

### Native Module Requirements
- **IMPORTANT**: Native modules must be rebuilt for Electron, not Node.js
- Always test LLM functions with `ELECTRON_RUN_AS_NODE=1` prefix
- node-llama-cpp must ONLY be imported in main process, never in renderer

## Testing Approach

### Unit Tests
```bash
npm test                  # Run Jest tests for React components
```

### LLM Testing
```bash
npm run llm:test          # Manual test with sample emails
npm run llm:evaluate      # Systematic evaluation with fixtures
```

### Integration Testing
- Manual testing via development servers
- Check `integration_tests.ipynb` for backend integration tests

## Build & Release

### GitHub Actions Workflows
- `.github/workflows/build-only.yml`: Build and sign without releasing
- `.github/workflows/release.yml`: Full release workflow

### Build Configuration
- Electron Builder config in `package.json` under `build` key
- Code signing identity: "Andrew Ting (NGANSYMPNR)"
- DMG creation for macOS distribution
- NSIS installer for Windows

### Confidence Scoring System

#### Unified Configuration
All confidence scoring uses centralized configuration:
- **Backend**: `electron/confidence-config.js` - Single source of truth for thresholds
- **Frontend**: `src/utils/confidence.ts` - UI utilities matching backend logic
- **Field Name**: `job_probability` (0-1 scale) - Replaces legacy `confidence`/`ml_confidence`

#### Confidence Thresholds
- **0.0-0.3**: Very Low - Needs review, high uncertainty
- **0.3-0.5**: Low - Needs review, moderate uncertainty  
- **0.5-0.7**: Medium - Optional review, moderate confidence
- **0.7-0.9**: High - Can auto-approve, high confidence
- **0.9-1.0**: Very High - Auto-approve, very high confidence

#### Functional Thresholds
- **Needs Review**: < 0.7 (requires human verification)
- **Auto-Approve**: ≥ 0.9 (can skip human review)
- **Min Job Storage**: ≥ 0.6 (minimum confidence to store as job)
- **Digest Filter**: ≥ 0.8 (confidence for newsletter detection)

## Security Considerations

- Never commit OAuth credentials or API keys
- Use electron-store for secure token storage
- Gmail tokens stored separately from user data
- All ML and LLM processing happens locally (no external API calls)
- Two-tier system: ML for classification (1-2ms), LLM for extraction (1-2s)
- Context isolation enabled in Electron

## Context Tracking System

### Automatic Edit Tracking
This project uses Claude Code hooks to combat "context rot" and maintain persistent memory across sessions:

- **Hook Configuration**: `.claude/settings.local.json` contains PostToolUse hooks
- **Tracking Script**: `.claude/hooks/track-edits.sh` logs all edits automatically
- **Context File**: `PROJECT_CONTEXT.md` maintains a rolling log of recent edits
- **Auto-Generated**: Every Edit/MultiEdit/Write operation is logged with timestamp

### How It Works
1. Hooks trigger after each file modification
2. Edit details are appended to PROJECT_CONTEXT.md
3. Last 100 edits are preserved (older entries rotate out)
4. All Claude Code sessions in this project share the same context

### For Claude Code Sessions
- **ALWAYS** check `PROJECT_CONTEXT.md` when starting a new task
- Reference recent edits to understand current project state
- The file contains both auto-generated edit logs and manual context notes
- This system works across ALL terminals/sessions in this project

### Project Organization
- **Test files**: Moved to `tests/` directory for better organization
- **Deprecated code**: Unused processors moved to `deprecated/` directory  
- **Migration files**: All kept in `electron/database/migrations/` for history tracking
- **Clean imports**: Removed unused processor imports from main files

## Common Tasks

### Adding New Features
1. Update TypeScript types in `src/types/`
2. Create/modify React components (follow MUI v7 Grid patterns)
3. Add IPC handlers if Electron communication needed
4. Test with both `npm start` and `npm run electron-dev`
5. **IMPORTANT**: Check RULES.md for critical project constraints (NO Firebase, Grid component usage)

### Debugging Issues
- Frontend: Browser DevTools in Electron window
- Main Process: Console logs in terminal running Electron
- LLM Issues: Check `npm run diagnose:native` output
- Database: SQLite files in platform userData directory

### Performance Optimization
- **ML Classification**: 200x faster than LLM (1-2ms vs 500ms)
- **Human Review**: Ensures 100% accuracy with bulk operations
- **Selective LLM**: Only process human-approved emails
- **Thread Grouping**: Process related emails as single jobs
- **Chronological Processing**: Maintains proper job timeline
- **Model Selection**: Test 5 different LLM models for extraction
- **Prompt Optimization**: Customize extraction prompts per model
- **GPU Acceleration**: Adjust `ONLYJOBS_N_GPU_LAYERS` for LLM
- **Cache**: Configure `ONLYJOBS_CACHE_TTL_HOURS` for results
- **Sync Control**: Adjust email fetch limits via Settings UI
- **ML Training**: Continuous improvement from user feedback