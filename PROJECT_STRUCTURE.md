# OnlyJobs Desktop - Project Structure & Cleanup Guide

## Database Schema (SQLite)

### Active Tables (Currently Used)
1. **jobs** - Main job applications table
   - Stores all job application data
   - Links to Gmail messages via `gmail_message_id`
   - Has email history and content

2. **email_sync** - Tracks processed emails
   - Prevents reprocessing of emails
   - Stores: gmail_message_id, processed_at, is_job_related, account_email

3. **gmail_accounts** - Gmail account connections
   - Stores OAuth tokens and account info
   - Multiple account support

4. **sync_status** - Current sync state
   - Single row table (id=1)
   - Tracks counters and last sync times

5. **sync_history** - Historical sync records
   - Logs each sync operation
   - Stats: emails fetched, classified, jobs found

### Potentially Unused Tables
- **job_applications** - Appears to be old schema (replaced by 'jobs')
- **job_emails** - Old relationship table (now using email_history in jobs)

## IPC Handlers (Electron ↔ React Communication)

### Database Operations
- `db:get-jobs` - Fetch jobs with filters
- `db:get-job` - Get single job
- `db:get-job-email` - Get job's email content
- `db:create-job` - Create new job
- `db:update-job` - Update job
- `db:delete-job` - Delete job
- `db:clear-all-records` - Clear entire database
- `db:clear-email-sync` - Clear email sync history
- `db:clear-email-sync-only` - (Duplicate of above?)

### Gmail Operations
- `gmail:authenticate` - OAuth flow (DEPRECATED - using multi-auth)
- `gmail:get-auth-status` - Check auth (DEPRECATED)
- `gmail:fetch-emails` - Fetch emails (DEPRECATED)
- `gmail:disconnect` - Disconnect account (DEPRECATED)
- `gmail:get-accounts` - Get all connected accounts (ACTIVE)
- `gmail:add-account` - Add new Gmail account (ACTIVE)
- `gmail:remove-account` - Remove account (ACTIVE)
- `gmail:sync-all` - Sync all accounts (ACTIVE)
- `gmail:get-sync-status` - Get current sync status

### LLM/ML Operations
- `classify-email` - Classify single email using LLM
- `llm:health-check` - Check LLM model health
- `ml:get-status` - Get ML status (OLD - Python based)
- `ml:is-ready` - Check ML ready (OLD)
- `ml:train-model` - Train ML model (OLD)
- `ml:initialize` - Initialize ML (OLD)

### Prompt Management
- `prompt:get` - Get current classification prompt
- `prompt:set` - Update classification prompt
- `prompt:reset` - Reset to default prompt
- `prompt:info` - Get prompt info
- `prompt:test` - Test prompt with sample email
- `prompt:token-info` - Get token count for text

### Auth Operations (Firebase - REMOVED)
- `auth:sign-in` - DEPRECATED
- `auth:sign-out` - DEPRECATED
- `auth:get-tokens` - DEPRECATED
- `auth:is-authenticated` - DEPRECATED

### System Operations
- `settings:get` - Get app settings
- `settings:update` - Update settings
- `data:export` - Export data to JSON
- `data:import` - Import data from JSON
- `dialog:select-file` - Open file dialog
- `dialog:save-file` - Save file dialog
- `system:notification` - Show system notification
- `system:open-external` - Open external URL
- `window:minimize/maximize/close` - Window controls

### OAuth Operations
- `initiate-oauth` - Start OAuth flow (OLD single-account)
- `oauth-completed` - OAuth callback (OLD)

## File Structure

### Core Electron Files
- `electron/main.js` - Main process entry
- `electron/preload.js` - Preload script for IPC
- `electron/ipc-handlers.js` - All IPC handlers
- `electron/gmail-multi-auth.js` - Multi-account Gmail auth (ACTIVE)
- `electron/auth-flow.js` - Single account OAuth (DEPRECATED?)
- `electron/database.js` - Database connection and setup

### LLM Integration (ACTIVE)
- `electron/llm/llmEngine.js` - Mistral-7B integration
- `electron/llm/config.js` - LLM configuration
- `electron/llm/rules.js` - Classification rules
- `electron/llm/prompts.js` - Prompt management

### ML Classifier (OLD/DEPRECATED)
- `ml-classifier/` - Python-based classifier (NOT USED)
- `electron/ml-handler.js` - Python shell handler (NOT USED)

### React Components
- `src/components/GmailMultiAccount.tsx` - Multi-account UI (ACTIVE)
- `src/components/GmailConnectionElectron.tsx` - Single account UI (DEPRECATED?)
- `src/components/LLMHealthCard.tsx` - LLM status display
- `src/components/PromptEditor.tsx` - Classification prompt editor

### React Pages
- `src/pages/Dashboard.tsx` - Main dashboard
- `src/pages/Jobs.tsx` - Job listings
- `src/pages/Settings.tsx` - Settings page
- `src/pages/Insights.tsx` - Analytics
- `src/pages/EmailProcessing.tsx` - Email processing UI
- `src/pages/PromptPage.tsx` - Prompt editing page

### Auth Context (Mixed State)
- `src/contexts/ElectronAuthContext.tsx` - Electron auth (ACTIVE)
- `src/contexts/FirebaseAuthContext.tsx` - Firebase auth (REMOVED)
- `src/services/firebase.ts` - Firebase config (REMOVED)

## Files to Consider Removing

### Definitely Remove (Not Used)
1. **ML Classifier Files**
   - `ml-classifier/` entire directory
   - `electron/ml-handler.js`
   - Any Python requirements files

2. **Old Gmail Auth**
   - `electron/auth-flow.js` (if not used)
   - `src/components/GmailConnectionElectron.tsx` (if using multi-account only)

3. **Firebase Remnants**
   - `src/contexts/FirebaseAuthContext.tsx`
   - `src/services/firebase.ts`
   - Any Firebase config files

4. **Duplicate IPC Handlers**
   - `db:clear-email-sync-only` (duplicate of `db:clear-email-sync`)
   - Old Gmail handlers (non-multi-account versions)

### Database Tables to Consider Dropping
- `job_applications` - Appears unused (using 'jobs' instead)
- `job_emails` - Appears unused (email_history in jobs table)

### Need Verification Before Removing
- Auth-related IPC handlers (may still be referenced)
- Single-account Gmail components (check if still used anywhere)

## Recommended Cleanup Actions

1. **Remove ML Classifier**
   ```bash
   rm -rf ml-classifier/
   rm electron/ml-handler.js
   ```

2. **Clean up IPC handlers**
   - Remove duplicate handlers
   - Remove ML-related handlers
   - Remove Firebase auth handlers

3. **Drop unused database tables**
   ```sql
   DROP TABLE IF EXISTS job_applications;
   DROP TABLE IF EXISTS job_emails;
   ```

4. **Remove Firebase files**
   - Already done but verify no references remain

5. **Consolidate Gmail components**
   - Keep only multi-account version
   - Remove single-account components if not needed

## Dependencies to Remove from package.json
- Python-shell (if removing ML classifier)
- Any Firebase packages (if not already removed)
- Unused UI libraries or components

## Before Cleanup Checklist
- [x] All changes committed to GitHub
- [ ] Database backed up
- [ ] Test app still works after each removal
- [ ] Update CLAUDE.md with changes
- [ ] Update README.md if needed