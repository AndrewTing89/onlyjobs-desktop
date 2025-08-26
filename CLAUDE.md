# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyJobs is an AI-powered job application tracking desktop application built with Electron, React, and TypeScript. It automatically syncs with Gmail, uses local LLM models with a 3-stage thread-aware classification system to classify and group job applications, and provides real-time analytics.

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
npm run llm:test          # Test 2-stage LLM classification (runs under Electron)
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
- **Thread-Aware 3-Stage LLM Classification System**:
  - **Stage 1**: Fast binary classification - Is this email job-related? (~1.5s)
  - **Stage 2**: Information extraction - Get company, position, status (only for job emails, ~2s)
  - **Stage 3**: Job matching - Are two emails for the same position? (~1s, only for orphan emails)
  - **Models**: Support for 5 different LLM models with per-stage customizable prompts
- **Database**: SQLite via better-sqlite3 (stored in userData directory)
- **Authentication**: AppAuth-JS for Gmail OAuth (NO Firebase - see RULES.md)

### Key Electron Components
1. **IPC Handlers** (`electron/ipc-handlers.js`): Real-time event-based communication
2. **Gmail Integration** (`electron/gmail-multi-auth.js`): Multi-account OAuth and email fetching with thread IDs
3. **Thread-Aware Processor** (`electron/thread-aware-processor.js`): NEW intelligent email grouping
4. **Two-Stage Classifier** (`electron/llm/two-stage-classifier.js`): 3-stage LLM system (includes job matching)
5. **LLM Engine** (`electron/llm/llmEngine.ts`): Streaming inference with early-stop optimization
6. **Model Manager** (`electron/model-manager.js`): Manages multiple LLM models and downloads
7. **Multi-Model Engine** (`electron/llm/multi-model-engine.js`): Concurrent model testing

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

### Email Processing Flow (Thread-Aware 3-Stage System)

#### Intelligent Processing Pipeline
```
Gmail Fetch (with thread IDs) → Group by Thread → Sort Chronologically →
  ├─ Threaded Emails (80%): Process as single job → Classify first email only
  └─ Orphan Emails (20%): Group by company → Run Stage 3 matching within groups
```

#### Stage 1: Binary Classification
- **Purpose**: Is this email job-related? (Yes/No)
- **Speed**: ~1.5 seconds
- **Runs on**: First email in thread OR all orphan emails
- **Output**: `{"is_job": true/false}`
- **Early exit**: Non-job emails skip Stages 2 & 3

#### Stage 2: Information Extraction
- **Purpose**: Extract company, position, and status
- **Speed**: ~2 seconds
- **Only runs on**: Emails that pass Stage 1
- **Output**: `{"company": "X", "position": "Y", "status": "Applied/Interview/Offer/Declined"}`

#### Stage 3: Job Matching
- **Purpose**: Are two job emails for the same position?
- **Speed**: ~1 second
- **Only runs on**: Orphan emails (no thread) within same company group
- **Output**: `{"same_job": true/false}`
- **Smart matching**: "Google SWE" matches "Google Software Engineer"

#### Performance Optimization
- **Thread Intelligence**: Gmail threads = one job (70-80% fewer LLM calls)
- **Chronological Processing**: Oldest → Newest (maintains proper timeline)
- **Company Grouping**: Stage 3 only compares within same company
- **Early Exit**: 30% faster by skipping non-job emails after Stage 1
- **Result**: Up to 85% reduction in processing time vs naive approach

### Database Schema
- `jobs`: Classified job applications (company, position, status, dates, **thread_id**, **email_thread_ids**)
- `email_sync`: Processed email tracking (prevents duplicates)
- `gmail_accounts`: Multi-account management
- `sync_status`: Sync progress tracking
- `llm_cache`: Classification result caching (7-day TTL)
- `model_prompts`: Model-specific Stage 1, Stage 2, and Stage 3 prompts

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

## Security Considerations

- Never commit OAuth credentials or API keys
- Use electron-store for secure token storage
- Gmail tokens stored separately from user data
- All ML and LLM processing happens locally (no external API calls)
- Two-tier system: ML for speed (10ms), LLM for accuracy (2-3s)
- Context isolation enabled in Electron

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
- **3-Stage System**: 30% faster by exiting early for non-job emails
- **Thread Grouping**: 70-80% fewer LLM calls by processing threads as single jobs
- **Company Grouping**: Stage 3 only runs within company groups (10x fewer comparisons)
- **Chronological Processing**: Maintains proper job timeline (application → interview → offer)
- **Model Selection**: Test 5 different models to find best performance
- **Prompt Optimization**: Customize prompts per model and per stage (3 prompts each)
- **LLM**: Adjust `ONLYJOBS_N_GPU_LAYERS` for GPU acceleration
- **Cache**: Configure `ONLYJOBS_CACHE_TTL_HOURS` for result caching
- **Sync**: Adjust email fetch limits via Settings UI (days to sync)
- **Individual Testing**: Test each model separately through dedicated dashboards
- **Monitoring**: Check model-specific dashboards for performance metrics