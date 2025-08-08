import { ipcMain, shell } from 'electron';
import http from 'http';
import { URL } from 'url';

// Import existing Gmail auth module
const GmailAuth = require('../gmail-auth.js');

// Fallback open function
async function openInBrowser(url: string) {
  try { 
    await shell.openExternal(url); 
  } catch { 
    const open = (await import('open')).default;
    await open(url); 
  }
}

function listenOnce(server: http.Server): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      if (!req.url) return;
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/gmail-callback') return;
      const code = u.searchParams.get('code');
      if (!code) return reject(new Error('No code'));
      res.statusCode = 200; 
      res.end('Gmail Connected Successfully! You can close this window.');
      resolve({ code });
      setImmediate(() => server.close());
    });
    server.on('error', reject);
  });
}

export function registerGmailAuthIPC() {
  ipcMain.handle('onlyjobs.auth.status', async () => {
    try {
      const gmailAuth = new GmailAuth();
      const tokens = gmailAuth.store.get('tokens');
      
      if (!tokens || !tokens.access_token) {
        return { connected: false };
      }
      
      // Try to get account email if available
      let accountEmail: string | undefined;
      try {
        const profile = await gmailAuth.getProfile();
        accountEmail = profile.emailAddress;
      } catch (e) {
        // Profile fetch failed, but we still have tokens
        accountEmail = undefined;
      }
      
      return { connected: true, accountEmail };
    } catch (error) {
      console.error('Error checking auth status:', error);
      return { connected: false };
    }
  });

  ipcMain.handle('onlyjobs.auth.start', async () => {
    try {
      const gmailAuth = new GmailAuth();
      
      // Start local server on random port
      const server = http.createServer();
      await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as any).port;
      const redirectUri = `http://127.0.0.1:${port}/gmail-callback`;
      
      // Update OAuth client with dynamic redirect URI
      gmailAuth.redirectUri = redirectUri;
      gmailAuth.oauth2Client = new (require('googleapis').google.auth.OAuth2)(
        gmailAuth.clientId,
        gmailAuth.clientSecret,
        redirectUri
      );
      
      // Generate auth URL
      const authUrl = gmailAuth.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: gmailAuth.scopes,
        prompt: 'consent',
      });

      await openInBrowser(authUrl);
      const { code } = await listenOnce(server);

      // Exchange code for tokens
      const { tokens } = await gmailAuth.oauth2Client.getToken(code);
      gmailAuth.oauth2Client.setCredentials(tokens);
      
      // Store tokens
      gmailAuth.store.set('tokens', tokens);
      
      // Get account email
      let accountEmail: string | undefined;
      try {
        const profile = await gmailAuth.getProfile();
        accountEmail = profile.emailAddress;
      } catch (e) {
        console.warn('Could not fetch profile:', e);
        accountEmail = undefined;
      }

      return { ok: true, accountEmail };
    } catch (error) {
      console.error('Gmail auth error:', error);
      throw error;
    }
  });

  ipcMain.handle('onlyjobs.auth.disconnect', async () => {
    try {
      const gmailAuth = new GmailAuth();
      
      // Try to revoke tokens
      try {
        const tokens = gmailAuth.store.get('tokens');
        if (tokens?.refresh_token || tokens?.access_token) {
          gmailAuth.oauth2Client.setCredentials(tokens);
          await gmailAuth.oauth2Client.revokeCredentials();
        }
      } catch (e) {
        console.warn('Could not revoke tokens:', e);
      }
      
      // Clear stored tokens
      gmailAuth.store.delete('tokens');
      
      return { ok: true };
    } catch (error) {
      console.error('Gmail disconnect error:', error);
      return { ok: true }; // Return success even if revocation failed
    }
  });
}