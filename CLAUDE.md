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
- **Optimized Stateless 2-Stage LLM System**:
  - **Stage 1**: Ultra-fast binary classification (~2s, 256-token context)
  - **Stage 2**: Efficient extraction (~3s, 768-token context, only for job emails)
  - **Architecture**: Stateless - each email gets fresh context (no exhaustion possible)
  - **Performance**: 50-60% faster than before, 100% reliable (no crashes)
  - **Models**: 5 LLM models supported, all prompts customizable via UI
- **Database**: SQLite via better-sqlite3 (stored in userData directory)
- **Authentication**: AppAuth-JS for Gmail OAuth (NO Firebase - see RULES.md)

### Key Electron Components
1. **IPC Handlers** (`electron/ipc-handlers.js`): Real-time event-based communication
2. **Gmail Integration** (`electron/gmail-multi-auth.js`): Multi-account OAuth and email fetching with thread IDs
3. **Thread-Aware Processor** (`electron/thread-aware-processor.js`): Groups emails by thread for efficiency
4. **Optimized Two-Stage Classifier** (`electron/llm/two-stage-classifier-optimized.js`): Stateless, lightweight LLM system
5. **LLM Config** (`electron/llm/config.js`): Stage-specific context sizes (256/768) and token limits (15/100)
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

### Email Processing Flow (Optimized Stateless 2-Stage System)

#### Architecture Philosophy
- **Stateless Processing**: Each email gets its own fresh context (no reuse complexity)
- **Lightweight Contexts**: 256 tokens for Stage 1, 768 for Stage 2 (vs 2048 before)
- **Optimized Prompts**: Ultra-concise for faster inference
- **No Context Exhaustion**: Impossible to get "No sequences left" errors

#### Processing Pipeline
```
Gmail Fetch → Group by Thread → Process Threads →
  ├─ Stage 1: Binary Classification (2s) → Not job? Exit early (saves 3s)
  └─ Stage 2: Extract Details (3s) → Only for job emails
```

#### Stage 1: Binary Classification
- **Purpose**: Is this email job-related? (Yes/No)
- **Speed**: ~2 seconds (improved from 5s)
- **Context Size**: 256 tokens (minimal)
- **Max Tokens**: 15 (just for `{"is_job": true/false}`)
- **Email Truncation**: 400 chars (aggressive for speed)
- **Early exit**: Non-job emails (70% of total) stop here

#### Stage 2: Information Extraction
- **Purpose**: Extract company, position, and status
- **Speed**: ~3 seconds (improved from 5s)
- **Context Size**: 768 tokens (moderate)
- **Max Tokens**: 100 (for full JSON extraction)
- **Email Truncation**: 1000 chars (more context for accuracy)
- **Output**: `{"company": "X", "position": "Y", "status": "Applied/Interview/Offer/Declined"}`

#### Performance Benefits
- **50% Faster**: Job emails process in 5s (vs 10s before)
- **60% Faster**: Non-job emails process in 2s (vs 5s before)
- **100% Reliable**: No context exhaustion possible
- **Simpler Code**: 400 lines vs 600+ lines
- **Memory Efficient**: Contexts immediately disposed after use
- **Model Caching**: Models stay loaded between emails (60s load only once)

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