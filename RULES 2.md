# CRITICAL PROJECT RULES - MUST FOLLOW

## 🚫 NEVER USE FIREBASE
**This is a DESKTOP-ONLY Electron application. Firebase must NEVER be used.**

### Why No Firebase:
1. This is an Electron desktop app, not a web app
2. All authentication is handled through Electron IPC and OAuth flows
3. Data is stored locally in SQLite database
4. Gmail OAuth is handled by AppAuth-JS in the main process

### What to Use Instead:
- **Authentication**: Electron IPC handlers + AppAuth-JS OAuth flow
- **Database**: Local SQLite (better-sqlite3)
- **User Data**: electron-store for preferences
- **Gmail API**: Direct Google OAuth through Electron main process

### Files That Should NOT Exist:
- `src/config/firebase.ts`
- `src/config/firebase.js`
- `src/contexts/AuthContext.tsx` (Firebase version)
- Any Firebase service files
- Any Firebase configuration

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
- Never import Firebase packages
- Never use web-only authentication flows

## Architecture Summary:
```
Frontend (React) <-> IPC <-> Electron Main Process <-> Gmail API/Local ML/SQLite
```

**NO FIREBASE. NO EXCEPTIONS.**