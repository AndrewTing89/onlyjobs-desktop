const { google } = require('googleapis');
const Database = require('better-sqlite3');
const EventEmitter = require('events');
const http = require('http');
const url = require('url');
const path = require('path');
const os = require('os');

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

class GmailMultiAuth extends EventEmitter {
  constructor() {
    super();
    
    // Initialize database
    try {
      const appDir = path.join(os.homedir(), 'Library', 'Application Support', 'onlyjobs-desktop');
      const dbPath = path.join(appDir, 'jobs.db');
      
      // Ensure directory exists
      const fs = require('fs');
      if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
        console.log('GmailMultiAuth: Created app directory:', appDir);
      }
      
      console.log('GmailMultiAuth: Initializing database at:', dbPath);
      this.db = new Database(dbPath);
      console.log('GmailMultiAuth: Database initialized successfully');
    } catch (error) {
      console.error('GmailMultiAuth: Failed to initialize database:', error);
      throw error;
    }
    
    // Gmail OAuth configuration
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '12002195951-6s2kd59s10acoh6bb43fq2dif0m5volv.apps.googleusercontent.com';
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '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';
    this.redirectUri = 'http://127.0.0.1:8001/gmail-callback';
    this.server = null;
    
    // Gmail-specific scopes
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
    
    // OAuth clients per account
    this.oauthClients = new Map();
  }
  
  // Get or create OAuth client for an account
  getOAuthClient(email = null) {
    if (!email) {
      // Return a new client for authentication
      return new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
    }
    
    if (!this.oauthClients.has(email)) {
      const client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
      
      // Load tokens from database
      const account = this.getAccount(email);
      if (account && account.access_token) {
        client.setCredentials({
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expiry_date: account.token_expiry
        });
      }
      
      this.oauthClients.set(email, client);
    }
    
    return this.oauthClients.get(email);
  }
  
  // Get all connected accounts
  getAllAccounts() {
    try {
      const stmt = this.db.prepare('SELECT * FROM gmail_accounts WHERE is_active = 1 ORDER BY connected_at DESC');
      return stmt.all();
    } catch (error) {
      console.error('GmailMultiAuth: Error getting accounts:', error);
      // Return empty array if table doesn't exist yet
      return [];
    }
  }
  
  // Get specific account
  getAccount(email) {
    const stmt = this.db.prepare('SELECT * FROM gmail_accounts WHERE email = ?');
    return stmt.get(email);
  }
  
  // Save account to database
  saveAccount(email, tokens) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO gmail_accounts (id, email, access_token, refresh_token, token_expiry)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const accountId = `gmail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    stmt.run(
      accountId,
      email,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
    );
    
    return accountId;
  }
  
  // Remove account
  removeAccount(email) {
    try {
      const stmt = this.db.prepare('UPDATE gmail_accounts SET is_active = 0 WHERE email = ?');
      stmt.run(email);
      this.oauthClients.delete(email);
    } catch (error) {
      console.error('GmailMultiAuth: Error removing account:', error);
    }
  }
  
  // Add new Gmail account
  async addAccount() {
    console.log('GmailMultiAuth: Starting authentication for new account...');
    
    // Start OAuth flow
    return this.startOAuthFlow();
  }
  
  async startOAuthFlow() {
    // Start local server to handle callback
    await this.startLocalServer();
    
    // Create new OAuth client
    const oauth2Client = this.getOAuthClient();
    
    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent' // Force consent to get refresh token
    });
    
    console.log('GmailMultiAuth: Opening browser for authentication...');
    
    // Open in system browser
    await shell.openExternal(authUrl);
    
    // Wait for the OAuth callback
    return new Promise((resolve, reject) => {
      this.once('auth-success', async (tokens) => {
        try {
          // Get user info
          oauth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const { data } = await oauth2.userinfo.get();
          
          // Save account
          this.saveAccount(data.email, tokens);
          
          resolve({
            email: data.email,
            tokens: tokens
          });
        } catch (error) {
          reject(error);
        }
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
              // Create temporary client for token exchange
              const tempClient = new google.auth.OAuth2(
                this.clientId,
                this.clientSecret,
                this.redirectUri
              );
              
              // Exchange code for tokens
              const { tokens } = await tempClient.getToken(code);
              
              console.log('GmailMultiAuth: Tokens received');
              
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                    <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                      <h1 style="color: #4CAF50;">Gmail Account Connected!</h1>
                      <p style="color: #666;">You can now close this window and return to OnlyJobs.</p>
                      <script>setTimeout(() => window.close(), 3000);</script>
                    </div>
                  </body>
                </html>
              `);
              
              this.stopLocalServer();
              this.emit('auth-success', tokens);
              
            } catch (error) {
              console.error('GmailMultiAuth: Token exchange error:', error);
              
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
        console.log('GmailMultiAuth: Local server started on http://127.0.0.1:8001');
        resolve();
      });
    });
  }
  
  async stopLocalServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          console.log('GmailMultiAuth: Local server stopped');
          resolve();
        });
      });
    }
  }
  
  // Fetch emails from specific account
  async fetchEmailsFromAccount(email, options = {}) {
    const { maxResults = 50, query = '', pageToken = null } = options;
    
    try {
      const oauth2Client = this.getOAuthClient(email);
      
      // Check if tokens need refresh
      const account = this.getAccount(email);
      if (account && account.refresh_token) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          // Update tokens in database
          const updateStmt = this.db.prepare(`
            UPDATE gmail_accounts 
            SET access_token = ?, token_expiry = ?
            WHERE email = ?
          `);
          updateStmt.run(credentials.access_token, credentials.expiry_date, email);
        } catch (error) {
          console.error(`Failed to refresh token for ${email}:`, error);
        }
      }
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      console.log(`GmailMultiAuth: Fetching emails from ${email}...`);
      
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
      
      console.log(`GmailMultiAuth: Found ${messages.length} messages from ${email}`);
      
      // Fetch full message details
      const fullMessages = [];
      for (const message of messages) {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          // Add account email to message
          fullMessage.data.accountEmail = email;
          fullMessages.push(fullMessage.data);
        } catch (error) {
          console.error(`GmailMultiAuth: Error fetching message ${message.id}:`, error);
        }
      }
      
      // Update last sync time
      const updateStmt = this.db.prepare('UPDATE gmail_accounts SET last_sync = CURRENT_TIMESTAMP WHERE email = ?');
      updateStmt.run(email);
      
      return {
        messages: fullMessages,
        nextPageToken: response.data.nextPageToken,
        accountEmail: email
      };
      
    } catch (error) {
      console.error(`GmailMultiAuth: Error fetching emails from ${email}:`, error);
      throw error;
    }
  }
  
  // Fetch emails from all accounts
  async fetchEmailsFromAllAccounts(options = {}) {
    const accounts = this.getAllAccounts();
    const allMessages = [];
    
    for (const account of accounts) {
      if (account.sync_enabled) {
        try {
          const result = await this.fetchEmailsFromAccount(account.email, options);
          allMessages.push(...result.messages);
        } catch (error) {
          console.error(`Failed to fetch from ${account.email}:`, error);
        }
      }
    }
    
    return {
      messages: allMessages,
      accountCount: accounts.length
    };
  }
}

module.exports = GmailMultiAuth;