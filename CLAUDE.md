# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyJobs is an AI-powered job application tracking desktop application built with Electron, React, and TypeScript. It automatically syncs with Gmail, uses local ML models to classify job applications, and provides real-time analytics.

## Common Development Commands

### Development
```bash
npm install                 # Install dependencies
npm start                   # Start React dev server on http://localhost:3000
npm run electron-dev       # Start Electron in development mode (run in separate terminal)
npm run build              # Production build
npm test                   # Run tests
```

### Building Distributable
```bash
npm run electron-dist      # Build and package Electron app
npm run dist              # Build without publishing
```

## High-Level Architecture

### Desktop Application Architecture
- **Electron Main Process**: Handles OAuth flows, Gmail API, ML classification
- **React Frontend**: Single Page Application with TypeScript
- **Authentication**: Hybrid approach:
  - AppAuth-JS for Gmail OAuth 2.0 flow (to access Gmail API)
  - Firebase Auth for user authentication (login/signup)
- **Local ML Classifier**: Python-based email classification running locally
- **Data Storage**: Local SQLite database (via better-sqlite3)

### Key Components
1. **Electron Main Process** (`electron/main.js`):
   - Manages app lifecycle and windows
   - Handles IPC communication with renderer
   - Manages OAuth flows via AppAuth-JS

2. **Gmail Integration** (`electron/gmail-multi-auth.js`):
   - Multi-account Gmail support
   - OAuth token management using AppAuth-JS
   - Email fetching and parsing

3. **ML Classification** (`ml-classifier/`):
   - Local Python model for job email classification
   - Invoked via python-shell from Electron
   - Pre-trained model included in distribution

4. **React Frontend** (`src/`):
   - Material-UI v7 + Chakra UI components
   - React Router v7 for navigation
   - Context API for state management

## Important Development Patterns

### Frontend Patterns
- Components in `src/components/` should be reusable and typed
- Pages in `src/pages/` handle routing and data fetching
- Services in `src/services/` handle API calls and Firebase operations
- All TypeScript types defined in `src/types/`
- Authentication state managed via AuthContext

### Electron Patterns
- IPC handlers in `electron/ipc-handlers.js`
- OAuth flows handled by `electron/auth-flow.js` using AppAuth-JS
- Gmail operations in `electron/gmail-multi-auth.js`
- ML processing via `electron/ml-handler.js`

### Data Schema
- Job application schema defined in `schema.json`
- Local SQLite database for job data storage
- Gmail tokens stored securely via electron-store

## Testing Approach
- Frontend: Jest + React Testing Library (run with `npm test`)
- Backend: pytest for unit tests
- Integration tests in `integration_tests.ipynb`
- Manual testing via local development servers

## Security Considerations
- Never commit secrets or API keys
- Use Google Secret Manager for sensitive configuration
- Firebase Security Rules protect user data
- IAM roles follow least-privilege principle

## Common Tasks

### Adding a New Feature
1. Update TypeScript types if needed
2. Create/modify React components
3. Update backend services if data processing changes
4. Test locally before deployment
5. Deploy using the automated notebook

### Debugging Issues
- Frontend logs: Browser DevTools console
- Backend logs: Google Cloud Console → Cloud Run → Logs
- Pub/Sub issues: Check message acknowledgment in GCP Console
- AI processing: Review Vertex AI logs and model responses

### Performance Optimization
- Frontend: Use React.memo for expensive components
- Backend: Monitor Cloud Run metrics, adjust concurrency
- Database: Use Firestore indexes for complex queries
- BigQuery: Partition tables by date for cost efficiency