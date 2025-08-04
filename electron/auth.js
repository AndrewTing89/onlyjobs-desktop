const { BrowserWindow } = require('electron');
const { google } = require('googleapis');

// Gmail OAuth configuration
// Note: In production, these should be stored securely
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '12002195951-t5i14vavkcmhhh2k8rvh02oheihcqel5.apps.googleusercontent.com';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// Scopes for Gmail access
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'email',
  'profile'
];

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  REDIRECT_URI
);

// Function to handle Gmail OAuth in Electron
async function authenticateGmail(mainWindow) {
  return new Promise((resolve, reject) => {
    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    // Create auth window
    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Load the auth URL
    authWindow.loadURL(authUrl);

    // Handle the callback
    authWindow.webContents.on('will-redirect', async (event, url) => {
      if (url.startsWith(REDIRECT_URI)) {
        event.preventDefault();
        
        // Extract code from URL
        const urlParams = new URL(url);
        const code = urlParams.searchParams.get('code');
        
        if (code) {
          try {
            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);
            
            // Close auth window
            authWindow.close();
            
            // Return tokens
            resolve({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry_date: tokens.expiry_date
            });
          } catch (error) {
            authWindow.close();
            reject(error);
          }
        } else {
          authWindow.close();
          reject(new Error('No authorization code received'));
        }
      }
    });

    // Handle window closed
    authWindow.on('closed', () => {
      reject(new Error('Auth window was closed by user'));
    });
  });
}

module.exports = { authenticateGmail, oauth2Client };