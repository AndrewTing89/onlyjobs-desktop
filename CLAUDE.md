# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyJobs is an AI-powered job application tracking desktop application built with Electron, React, and TypeScript. It automatically syncs with Gmail, uses local LLM models to classify job applications, and provides real-time analytics.

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
npm run llm:download      # Download the Llama model
npm run llm:test          # Test LLM classification (runs under Electron)
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
- **Local LLM Engine** (`electron/llm/`): node-llama-cpp for email classification
- **Database**: SQLite via better-sqlite3 (stored in userData directory)
- **Authentication**: Dual approach - AppAuth-JS for Gmail OAuth, Firebase for user auth

### Key Electron Components
1. **IPC Handlers** (`electron/ipc-handlers.js`): Real-time event-based communication
2. **Gmail Integration** (`electron/gmail-multi-auth.js`): Multi-account OAuth and email fetching
3. **Email Processor** (`electron/integrated-email-processor.js`): Unified processing pipeline with prefiltering
4. **Email Rules** (`electron/email-rules.js`): Domain and keyword-based prefiltering
5. **LLM Engine** (`electron/llm/llmEngine.ts`): Streaming inference with early-stop optimization
6. **Classifier Factory** (`electron/classifier/providerFactory.js`): Pure LLM provider

### Frontend Architecture
- **Components** (`src/components/`): Reusable UI components
  - `JobsList.tsx`: Real-time job dashboard with live updates
  - `GmailMultiAccount.tsx`: Multi-account management with settings UI
  - `EmailViewModal.tsx`: Job email viewer
- **Pages** (`src/pages/`): Route-level components
- **Services** (`src/services/`): API and Firebase operations
- **Context** (`src/context/AuthContext.tsx`): Authentication state management
- **Types** (`src/types/`): TypeScript type definitions

## Important Development Patterns

### Environment Configuration
- Root `.env`: React app environment variables
- `electron/.env`: Electron main process OAuth credentials
- Both must have matching Google OAuth credentials

### Email Processing Flow (2-Tier System)

#### Stage 1: Prefiltering (`electron/email-rules.js`)
- **Domain-based filtering**: Checks against 60+ non-job domains and 30+ ATS domains
- **Keyword matching**: Regex patterns for job-related keywords
- **Returns**: `'not_job'` (skip), `'definitely_job'` (process), or `'uncertain'` (needs LLM)
- **Performance**: Eliminates ~60-70% of LLM calls using pure JavaScript

#### Stage 2: LLM Classification (if needed)
1. Cache lookup (7-day TTL default, SQLite-based)
2. LLM inference with streaming early-stop
3. JSON schema validation and normalization
4. Database storage with deduplication

#### Complete Flow
```
Email arrives → Prefilter check →
  ├─ "not_job" → Mark as filtered, skip LLM
  ├─ "definitely_job" → Run LLM for extraction
  └─ "uncertain" → Run LLM for classification
```

### Database Schema
- `jobs`: Classified job applications
- `email_sync`: Processed email tracking
- `gmail_accounts`: Multi-account management
- `sync_status`: Sync progress tracking
- `llm_cache`: Classification result caching

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
- All LLM processing happens locally (no external API calls)
- Context isolation enabled in Electron

## Common Tasks

### Adding New Features
1. Update TypeScript types in `src/types/`
2. Create/modify React components
3. Add IPC handlers if Electron communication needed
4. Test with both `npm start` and `npm run electron-dev`

### Debugging Issues
- Frontend: Browser DevTools in Electron window
- Main Process: Console logs in terminal running Electron
- LLM Issues: Check `npm run diagnose:native` output
- Database: SQLite files in platform userData directory

### Performance Optimization
- **Prefiltering**: Automatically filters ~60-70% of emails before LLM
- **LLM**: Adjust `ONLYJOBS_N_GPU_LAYERS` for GPU acceleration
- **Cache**: Configure `ONLYJOBS_CACHE_TTL_HOURS` for result caching
- **Sync**: Adjust email fetch limits via Settings UI (1-1000 per account)
- **Monitoring**: Check console logs for "⚡ Pre-filtered" messages to see filtering in action