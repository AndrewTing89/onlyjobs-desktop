# CRITICAL PROJECT RULES - MUST FOLLOW

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