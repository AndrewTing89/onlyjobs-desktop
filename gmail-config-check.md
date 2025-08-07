# Gmail Configuration Check

## Current Configuration

### OAuth Credentials (from .env files)
- **Client ID**: `12002195951-6s2kd59s10acoh6bb43fq2dif0m5volv.apps.googleusercontent.com`
- **Client Secret**: `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`

### Redirect URIs in Code
1. **auth-flow.js** (AppAuth for general OAuth): `http://localhost:8000/callback`
2. **gmail-auth.js** (Gmail specific): `http://127.0.0.1:8001/gmail-callback`
3. **gmail-multi-auth.js** (Multi-account Gmail): `http://127.0.0.1:8001/gmail-callback`

## Required Google Cloud Console Settings

In your Google Cloud Console (https://console.cloud.google.com/), ensure these redirect URIs are added to your OAuth 2.0 Client ID:

1. `http://localhost:8000/callback` - For AppAuth general OAuth
2. `http://127.0.0.1:8000/callback` - Alternative for AppAuth
3. `http://127.0.0.1:8001/gmail-callback` - For Gmail-specific OAuth
4. `http://localhost:8001/gmail-callback` - Alternative for Gmail

## Testing Steps

1. **Start the app**:
   ```bash
   npm start
   npm run electron-dev
   ```

2. **Connect Gmail**:
   - Click "Connect Gmail" button
   - Browser should open to Google OAuth
   - Check the redirect URI in the browser URL
   - Complete authorization

3. **If it fails**, check:
   - Browser console for errors
   - Electron dev tools console
   - The redirect URI that Google is using

## Common Issues

1. **"Redirect URI mismatch"** - The URI in your code doesn't match what's in Google Cloud Console
2. **"Invalid client"** - Client ID or secret is wrong
3. **Connection refused** - Local server isn't running on the expected port

## Fix Instructions

If Gmail fetch isn't working:

1. **Verify Google Cloud Console**:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click on your OAuth 2.0 Client ID
   - Add ALL these redirect URIs:
     - `http://127.0.0.1:8000/callback`
     - `http://localhost:8000/callback`
     - `http://127.0.0.1:8001/gmail-callback`
     - `http://localhost:8001/gmail-callback`

2. **Clear and retry**:
   - The app data has been cleared
   - Restart the app
   - Try connecting Gmail again

The Gmail fetch function itself is correct. The issue is likely with authentication/OAuth configuration.