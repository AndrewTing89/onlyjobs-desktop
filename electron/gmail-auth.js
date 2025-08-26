const { google } = require('googleapis');
const Store = require('electron-store').default || require('electron-store');
const http = require('http');
const url = require('url');
const EventEmitter = require('events');

// Handle electron imports gracefully
let shell;
try {
  const electron = require('electron');
  shell = electron.shell;
} catch (e) {
  // Running outside Electron, use node's open
  const { exec } = require('child_process');
  shell = {
    openExternal: (url) => {
      const start = (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open');
      return new Promise((resolve) => {
        exec(`${start} "${url}"`, (err) => {
          resolve(!err);
        });
      });
    }
  };
}

class GmailAuth extends EventEmitter {
  constructor() {
    super();
    // electron-store needs projectName when running outside Electron
    const storeOptions = { name: 'gmail-auth' };
    if (!process.versions.electron) {
      storeOptions.projectName = 'onlyjobs-desktop';
    }
    this.store = new Store(storeOptions);
    
    // Gmail OAuth configuration - Using the same Desktop OAuth credentials
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '17718847205-getvrh47jb81e0c2png9bv00jn3a9tpi.apps.googleusercontent.com';
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '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';
    this.redirectUri = 'http://127.0.0.1:8001/gmail-callback'; // Using loopback IP as per Google OAuth requirements
    this.server = null;
    
    // Gmail-specific scopes
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels'
    ];
    
    // Create OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
    
    // Load stored tokens if available
    this.loadStoredTokens();
  }
  
  loadStoredTokens() {
    const tokens = this.store.get('gmail_tokens');
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
      console.log('GmailAuth: Loaded stored tokens');
    }
  }
  
  async authenticate() {
    console.log('GmailAuth: Starting authentication...');
    
    // Check if we already have valid tokens
    const tokens = this.store.get('gmail_tokens');
    if (tokens && tokens.refresh_token) {
      this.oauth2Client.setCredentials(tokens);
      
      try {
        // Try to refresh the access token
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.store.set('gmail_tokens', credentials);
        console.log('GmailAuth: Refreshed access token');
        this.emit('authenticated', credentials);
        return credentials;
      } catch (error) {
        console.log('GmailAuth: Token refresh failed, need new auth');
      }
    }
    
    // Start OAuth flow
    return this.startOAuthFlow();
  }
  
  async startOAuthFlow() {
    // Start local server to handle callback
    await this.startLocalServer();
    
    // Generate auth URL
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent' // Force consent to get refresh token
    });
    
    console.log('GmailAuth: Opening browser for authentication...');
    console.log('GmailAuth: Auth URL:', authUrl);
    
    // Open in system browser
    await shell.openExternal(authUrl);
    
    // Wait for the OAuth callback
    return new Promise((resolve, reject) => {
      this.once('auth-success', (tokens) => {
        resolve(tokens);
      });
      
      this.once('auth-error', (error) => {
        reject(error);
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        this.stopLocalServer();
        reject(new Error('Authentication timeout'));
      }, 300000);
    });
  }
  
  async startLocalServer() {
    if (this.server) {
      await this.stopLocalServer();
    }
    
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/gmail-callback') {
          const code = parsedUrl.query.code;
          const error = parsedUrl.query.error;
          
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                  <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: #d32f2f;">Authentication Failed</h1>
                    <p style="color: #666;">Error: ${error}</p>
                    <p style="color: #666;">You can close this window and try again.</p>
                  </div>
                </body>
              </html>
            `);
            
            this.stopLocalServer();
            this.emit('auth-error', new Error(error));
            return;
          }
          
          if (code) {
            try {
              // Exchange code for tokens
              const { tokens } = await this.oauth2Client.getToken(code);
              
              // Store tokens
              this.oauth2Client.setCredentials(tokens);
              this.store.set('gmail_tokens', tokens);
              
              console.log('GmailAuth: Tokens received and stored');
              
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                    <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h1 style="color: #4CAF50;">Gmail Connected Successfully!</h1>
                      <p style="color: #666;">You can now close this window and return to OnlyJobs.</p>
                      <script>setTimeout(() => window.close(), 3000);</script>
                    </div>
                  </body>
                </html>
              `);
              
              this.stopLocalServer();
              this.emit('auth-success', tokens);
              this.emit('authenticated', tokens);
              
            } catch (error) {
              console.error('GmailAuth: Token exchange error:', error);
              
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                    <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h1 style="color: #d32f2f;">Token Exchange Failed</h1>
                      <p style="color: #666;">Error: ${error.message}</p>
                      <p style="color: #666;">Please try again.</p>
                    </div>
                  </body>
                </html>
              `);
              
              this.stopLocalServer();
              this.emit('auth-error', error);
            }
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      this.server.listen(8001, '127.0.0.1', () => {
        console.log('GmailAuth: Local server started on http://127.0.0.1:8001');
        resolve();
      });
    });
  }
  
  async stopLocalServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          console.log('GmailAuth: Local server stopped');
          resolve();
        });
      });
    }
  }
  
  async fetchEmails(options = {}) {
    const { maxResults = 50, query = '', pageToken = null } = options;
    
    try {
      // Ensure we have valid credentials
      await this.authenticate();
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      
      console.log('GmailAuth: Fetching emails...');
      
      // List messages
      const params = {
        userId: 'me',
        maxResults,
        q: query || 'in:inbox'
      };
      
      if (pageToken) {
        params.pageToken = pageToken;
      }
      
      const response = await gmail.users.messages.list(params);
      const messages = response.data.messages || [];
      
      console.log(`GmailAuth: Found ${messages.length} messages`);
      
      // Fetch full message details
      const fullMessages = [];
      for (const message of messages) {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          fullMessages.push(fullMessage.data);
        } catch (error) {
          console.error(`GmailAuth: Error fetching message ${message.id}:`, error);
        }
      }
      
      return {
        messages: fullMessages,
        nextPageToken: response.data.nextPageToken
      };
      
    } catch (error) {
      console.error('GmailAuth: Error fetching emails:', error);
      throw error;
    }
  }
  
  async disconnect() {
    this.store.delete('gmail_tokens');
    this.oauth2Client.setCredentials({});
    console.log('GmailAuth: Disconnected');
  }
  
  isAuthenticated() {
    const tokens = this.store.get('gmail_tokens');
    return !!(tokens && tokens.refresh_token);
  }
  
  getStoredTokens() {
    return this.store.get('gmail_tokens');
  }
}

module.exports = GmailAuth;