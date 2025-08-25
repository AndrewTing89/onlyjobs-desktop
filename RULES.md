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