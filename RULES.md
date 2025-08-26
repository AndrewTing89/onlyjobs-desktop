# CRITICAL PROJECT RULES - MUST FOLLOW

## 📦 MUI COMPONENT USAGE - IMPORTANT

### Grid Component (MUI v7.2.0)
**ALWAYS use the standard Grid component, NOT Grid2**

#### CORRECT Import:
```javascript
import Grid from '@mui/material/Grid';
```

#### INCORRECT Imports (Will Fail):
```javascript
import Grid2 from '@mui/material/Grid2';  // ❌ Grid2 doesn't exist at this path in v7
import { Grid2 } from '@mui/material';    // ❌ Not exported from main
```

#### Why This Matters:
- MUI v7.2.0 uses the standard Grid component at `@mui/material/Grid`
- Grid2 was a v5.9+ experimental component that has been merged back
- The Grid component in v7 includes all Grid2 improvements
- There is no separate Grid2 module in our MUI v7.2.0 installation

#### Correct Grid Usage in MUI v7:
```javascript
<Grid container spacing={2}>
  <Grid size={6}>  // Takes 6/12 columns
    Content
  </Grid>
  <Grid size={{ xs: 12, md: 6 }}>  // Responsive: 12 on mobile, 6 on desktop
    Content
  </Grid>
</Grid>
```

#### Grid Props in v7:
- Use `size` prop for column sizing (not xs, sm, md as individual props)
- NO `item` prop needed (Grid v7 doesn't use it)
- Use `container` prop for grid containers
- For responsive: `size={{ xs: 12, sm: 6, md: 4 }}`

## 🚫 NEVER USE FIREBASE - PERMANENT BAN
**This is a DESKTOP-ONLY Electron application. Firebase must NEVER be used.**

### FORBIDDEN PACKAGES (Never Install):
- `firebase`
- `firebase-tools`
- `firebase-admin`
- `@firebase/*`
- Any package with "firebase" in the name

### FORBIDDEN IMPORTS (Will Break The App):
```javascript
// NEVER DO THIS:
import ... from 'firebase/...';
import ... from '@firebase/...';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext'; // Use ElectronAuthContext instead!
```

### FORBIDDEN FILES (Already Deleted):
- `src/config/firebase.ts` ❌
- `src/contexts/AuthContext.tsx` ❌ (Use ElectronAuthContext.tsx ✅)
- `src/services/api.service.ts` ❌
- `src/services/gmailFetch.service.ts` ❌
- `.firebaserc` ❌
- `.firebase/` ❌
- Any web-only authentication pages ❌

### Why No Firebase:
1. This is an Electron desktop app, not a web app
2. All authentication is handled through Electron IPC and OAuth flows
3. Data is stored locally in SQLite database
4. Gmail OAuth is handled by AppAuth-JS in the main process
5. Firebase adds unnecessary complexity and security risks for desktop apps

### What to Use Instead:
- **Authentication**: Electron IPC handlers + AppAuth-JS OAuth flow
- **Database**: Local SQLite (better-sqlite3)
- **User Data**: electron-store for preferences
- **Gmail API**: Direct Google OAuth through Electron main process
- **File Storage**: Local file system
- **Analytics**: Local analytics or desktop-specific solutions

### Correct Authentication Flow:
1. User clicks "Connect Gmail" in Electron app
2. Electron main process initiates OAuth with AppAuth-JS
3. Browser opens for Google authentication
4. Callback returns to `http://localhost:8000/callback`
5. Tokens stored securely in electron-store
6. Gmail API accessed directly with tokens

## ✅ ALWAYS REMEMBER
- This is a DESKTOP application
- Use Electron IPC for all backend communication
- Use `window.electronAPI` for all API calls
- Import from `ElectronAuthContext`, never `AuthContext`
- Never import Firebase packages
- Never use web-only authentication flows

## Architecture Summary:
```
Frontend (React) <-> IPC <-> Electron Main Process <-> Gmail API/Local ML/SQLite
                     ^^^
                     ONLY communication channel
```

## Enforcement Checklist:
- [ ] No "firebase" text in package.json
- [ ] No imports from 'firebase' packages
- [ ] Only ElectronAuthContext is used
- [ ] App.tsx returns ElectronApp directly
- [ ] No web-only pages exist
- [ ] All auth through Electron IPC

## Git Pre-commit Check (Recommended):
```bash
#!/bin/sh
# Add to .git/hooks/pre-commit
if git diff --cached --name-only | xargs grep -l "firebase" 2>/dev/null; then
  echo "❌ BLOCKED: Firebase reference detected!"
  echo "See RULES.md - This is a desktop-only app"
  exit 1
fi
```

**NO FIREBASE. NO EXCEPTIONS. EVER.**

## 📧 EMAIL PROCESSING WORKFLOW - CRITICAL RULES

### MANDATORY Processing Order
**ALWAYS process emails OLDEST → NEWEST. This is NON-NEGOTIABLE.**

#### Why This Matters:
- Gmail API returns NEWEST first by default
- We MUST reverse the array to process chronologically
- This ensures proper job lifecycle: Application → Interview → Offer
- Without this, the timeline is backwards and wrong

#### CORRECT Implementation:
```javascript
// Gmail returns: [Dec 5 Interview, Dec 1 Application] (newest first)
emails.reverse(); // MANDATORY!
// Now: [Dec 1 Application, Dec 5 Interview] (oldest first)
```

#### INCORRECT (Will Break Timeline):
```javascript
// ❌ Processing newest first creates backwards timeline
for (const email of emails) { // WRONG - not reversed!
  processEmail(email);
}
```

### Thread-Aware Processing Rules

#### Rule 1: Gmail Threads = Single Jobs
- If emails share a threadId, they ARE the same job
- ONLY classify the FIRST email in thread
- ALL emails in thread inherit the classification
- NEVER run Stage 3 matching on threaded emails

#### Rule 2: Three Stages with Specific Purposes
1. **Stage 1**: Binary classification - Is this job-related? (Yes/No)
2. **Stage 2**: Information extraction - Get company, position, status
3. **Stage 3**: Job matching - Are two orphan emails the same job?

#### Rule 3: Stage 3 ONLY for Orphans
- Stage 3 NEVER runs on threaded emails
- Stage 3 ONLY compares within same company
- Stage 3 ONLY runs on emails without threads

#### Rule 4: Company Grouping is Mandatory
```javascript
// CORRECT: Group orphans by company first
const companyGroups = groupByCompanyDomain(orphans);
// Stage 3 only runs within each company group

// ❌ WRONG: Comparing all orphans with each other
for (const email1 of orphans) {
  for (const email2 of orphans) {
    compare(email1, email2); // NO! This is O(n²) and wrong
  }
}
```

### Performance Requirements

#### Minimum Performance Standards:
- Thread grouping MUST reduce LLM calls by at least 70%
- Non-job emails MUST exit after Stage 1 (no Stage 2/3)
- Stage 3 MUST only run within company groups
- Processing 1000 emails should require < 600 LLM calls

#### Optimization Checklist:
- [ ] Emails processed oldest → newest
- [ ] Threads processed as single units
- [ ] Only first email in thread classified
- [ ] Stage 3 only runs on orphans
- [ ] Company grouping limits Stage 3 comparisons
- [ ] Early exit for non-job emails

### Status Progression Logic

#### Status Must Only Move Forward:
```javascript
const STATUS_PRIORITY = {
  'Applied': 1,
  'Interview': 2,
  'Offer': 3,
  'Declined': 4
};

// ✅ CORRECT: Status progresses forward
Applied → Interview → Offer

// ❌ WRONG: Status moving backwards
Offer → Applied // NEVER DO THIS
```

### Database Requirements

#### Thread Support is Mandatory:
- `jobs` table MUST have `thread_id` column
- `jobs` table MUST have `email_thread_ids` column (JSON array)
- Index on `thread_id` for performance

### Testing Requirements

Before ANY email processing changes:
1. Test with mixed threads and orphans
2. Verify chronological processing
3. Confirm Stage 3 only runs on orphans
4. Check LLM call count is < 60% of email count
5. Validate timeline is Application → Interview → Offer

### Common Violations to Avoid

1. **DO NOT** process emails newest → oldest
2. **DO NOT** classify every email in a thread
3. **DO NOT** run Stage 3 on threaded emails
4. **DO NOT** compare jobs from different companies
5. **DO NOT** skip the reversal of Gmail results
6. **DO NOT** update job status backwards
7. **DO NOT** ignore threadId from Gmail

### Enforcement

Any PR that violates these workflow rules should be:
1. Immediately blocked
2. Required to fix the processing order
3. Required to show performance metrics
4. Required to demonstrate thread awareness

**See EMAIL_PROCESSING_WORKFLOW.md for complete technical details**