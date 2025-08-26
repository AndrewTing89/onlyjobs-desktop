const { AuthorizationRequest, AuthorizationNotifier, AuthorizationServiceConfiguration, BaseTokenRequestHandler, TokenRequest, GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN } = require('@openid/appauth');
const { NodeBasedHandler } = require('@openid/appauth/built/node_support/node_request_handler');
const { NodeCrypto } = require('@openid/appauth/built/node_support/crypto_utils');
const { NodeRequestor } = require('@openid/appauth/built/node_support/node_requestor');
const { BrowserWindow } = require('electron');
const EventEmitter = require('events');
const Store = require('electron-store').default || require('electron-store');
const http = require('http');
const url = require('url');
// Load dotenv - try both locations
if (process.env.NODE_ENV !== 'production') {
  try {
    // First try electron/.env
    const electronEnvPath = require('path').join(__dirname, '.env');
    const fs = require('fs');
    if (fs.existsSync(electronEnvPath)) {
      require('dotenv').config({ path: electronEnvPath });
      console.log('Loaded electron/.env');
    } else {
      // Fall back to root .env
      require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
      console.log('Loaded root .env');
    }
  } catch (e) {
    console.error('Failed to load .env:', e);
  }
}

class ElectronAuthFlow extends EventEmitter {
  constructor() {
    super();
    this.store = new Store({ name: 'auth' });
    this.crypto = new NodeCrypto();
    this.notifier = new AuthorizationNotifier();
    this.authorizationHandler = new NodeBasedHandler();
    this.tokenHandler = new BaseTokenRequestHandler(new NodeRequestor());
    this.authPromiseResolve = null;
    this.authPromiseReject = null;
    
    // OAuth configuration for Google Desktop App
    // Using Desktop OAuth client - client secret is not confidential for desktop apps
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '17718847205-getvrh47jb81e0c2png9bv00jn3a9tpi.apps.googleusercontent.com';
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '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'; // Desktop app secret (not confidential)
    this.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:8000/callback';
    this.scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels';
    this.server = null;
    
    console.log('🔵 OAuth Config:', {
      clientId: this.clientId,
      hasSecret: !!this.clientSecret,
      redirectUri: this.redirectUri
    });
    
    // Set up the notifier
    this.notifier.setAuthorizationListener((request, response, error) => {
      if (response) {
        this.handleAuthorizationResponse(response);
      } else if (error) {
        console.error('Authorization error:', error);
        this.emit('auth-error', error);
      }
    });
    
    // Replace the NodeBasedHandler with a custom handler for localhost
    this.authorizationHandler = {
      performAuthorizationRequest: (configuration, request) => {
        // Store the current request for later use
        this.currentAuthRequest = request;
        this.startLocalServer(request).then(() => {
          const authUrl = this.buildAuthorizationUrl(configuration, request);
          console.log('Opening authorization URL:', authUrl);
          require('electron').shell.openExternal(authUrl);
        });
      }
    };
  }
  
  async initialize() {
    // Google's OpenID configuration
    this.configuration = new AuthorizationServiceConfiguration({
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
      revocation_endpoint: 'https://oauth2.googleapis.com/revoke',
      userinfo_endpoint: 'https://www.googleapis.com/oauth2/v3/userinfo'
    });
  }
  
  async signIn() {
    console.log('ElectronAuthFlow: Starting sign in...');
    await this.initialize();
    
    // Create a promise that will resolve when auth completes
    return new Promise((resolve, reject) => {
      this.authPromiseResolve = resolve;
      this.authPromiseReject = reject;
      
      // Create the authorization request with NodeCrypto
      // Generate a random state for security
      const state = Math.random().toString(36).substring(2, 15);
      const request = new AuthorizationRequest({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        scope: this.scope,
        response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
        state: state,
        extras: { 'prompt': 'select_account' }
      }, this.crypto);
      
      // Store the state for verification
      this.store.set('auth_state', state);
      
      console.log('ElectronAuthFlow: Auth request created with redirect URI:', this.redirectUri);
      
      // Generate code verifier for PKCE
      request.setupCodeVerifier().then(() => {
        // Access code verifier from internal property
        const codeVerifier = request.internal?.code_verifier;
        
        // Store the code verifier
        if (codeVerifier) {
          this.store.set('code_verifier', codeVerifier);
          console.log('ElectronAuthFlow: Code verifier stored');
        } else {
          console.error('ElectronAuthFlow: No code verifier generated');
          reject(new Error('Failed to generate code verifier'));
          return;
        }
        
        // Make the authorization request
        console.log('ElectronAuthFlow: Performing authorization request...');
        this.authorizationHandler.performAuthorizationRequest(this.configuration, request);
      });
    });
  }
  
  async handleAuthorizationResponse(response, error = null) {
    console.log('🔵 ElectronAuthFlow: Handling authorization response:', response, 'error:', error);
    
    if (error) {
      console.error('🔴 ElectronAuthFlow: Authorization error:', error);
      this.emit('auth-error', error.message || 'Authorization failed');
      if (this.authPromiseReject) {
        this.authPromiseReject(error);
        this.authPromiseResolve = null;
        this.authPromiseReject = null;
      }
      return;
    }
    
    if (!response || !response.code) {
      console.error('🔴 ElectronAuthFlow: No authorization code in response');
      this.emit('auth-error', 'No authorization code received');
      if (this.authPromiseReject) {
        this.authPromiseReject(new Error('No authorization code received'));
        this.authPromiseResolve = null;
        this.authPromiseReject = null;
      }
      return;
    }
    console.log('🔵 ElectronAuthFlow: Got authorization code, exchanging for tokens...');
    
    // Get stored code verifier
    const codeVerifier = this.store.get('code_verifier');
    console.log('🔵 ElectronAuthFlow: Code verifier retrieved:', !!codeVerifier);
    
    // Create token request
    const tokenRequest = new TokenRequest({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
      code: response.code,
      extras: {
        code_verifier: codeVerifier,
        client_secret: this.clientSecret
      }
    });
    console.log('🔵 ElectronAuthFlow: Token request created');
    
    try {
      // Exchange code for tokens
      console.log('🔵 ElectronAuthFlow: Performing token exchange...');
      const tokenResponse = await this.tokenHandler.performTokenRequest(this.configuration, tokenRequest);
      console.log('🟢 ElectronAuthFlow: Token exchange successful!');
      console.log('🔵 ElectronAuthFlow: Tokens received:', {
        hasAccessToken: !!tokenResponse.accessToken,
        hasIdToken: !!tokenResponse.idToken,
        hasRefreshToken: !!tokenResponse.refreshToken
      });
      
      // Store tokens
      this.store.set('tokens', {
        access_token: tokenResponse.accessToken,
        id_token: tokenResponse.idToken,
        refresh_token: tokenResponse.refreshToken,
        expires_at: Date.now() + (tokenResponse.expiresIn || 3600) * 1000
      });
      console.log('🔵 ElectronAuthFlow: Tokens stored in electron-store');
      
      // Get user info
      console.log('🔵 ElectronAuthFlow: Fetching user info...');
      const userInfo = await this.getUserInfo(tokenResponse.accessToken);
      console.log('🟢 ElectronAuthFlow: User info received:', userInfo);
      
      // Prepare success data
      const authData = {
        tokens: tokenResponse,
        user: userInfo
      };
      
      // Emit success event
      console.log('🟢 ElectronAuthFlow: Auth successful, emitting auth-success event');
      this.emit('auth-success', authData);
      
      // Also directly notify the main window
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();
      console.log(`🔵 ElectronAuthFlow: Found ${windows.length} windows`);
      
      windows.forEach((window, index) => {
        console.log(`🔵 ElectronAuthFlow: Sending auth-success to window ${index} (id: ${window.id})`);
        window.webContents.send('auth-success', authData);
      });
      
      // Resolve the sign-in promise
      if (this.authPromiseResolve) {
        console.log('🟢 ElectronAuthFlow: Resolving auth promise with data');
        this.authPromiseResolve(authData);
        this.authPromiseResolve = null;
        this.authPromiseReject = null;
      } else {
        console.log('⚠️ ElectronAuthFlow: No auth promise to resolve!');
      }
      
    } catch (error) {
      console.error('🔴 ElectronAuthFlow: Token exchange error:', error);
      console.error('🔴 ElectronAuthFlow: Error details:', {
        message: error.message,
        statusCode: error.statusCode,
        body: error.body,
        stack: error.stack
      });
      
      // Check if it's a client credentials issue
      if (error.message && (error.message.includes('invalid_client') || error.message.includes('Bad Request'))) {
        console.error('🔴 ElectronAuthFlow: Invalid OAuth credentials. Check client ID and secret.');
      }
      
      this.emit('auth-error', error.message || error);
      
      // Reject the sign-in promise
      if (this.authPromiseReject) {
        this.authPromiseReject(error);
        this.authPromiseResolve = null;
        this.authPromiseReject = null;
      }
    }
  }
  
  async getUserInfo(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get user info');
      }
      
      const userInfo = await response.json();
      console.log('ElectronAuthFlow: User info retrieved:', userInfo);
      return userInfo;
    } catch (error) {
      console.error('Error getting user info:', error);
      // Try to parse user info from ID token as fallback
      const tokens = this.store.get('tokens');
      if (tokens && tokens.id_token) {
        try {
          // Decode JWT ID token (basic parsing - not verifying signature)
          const parts = tokens.id_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('ElectronAuthFlow: Fallback - parsed user from ID token:', payload);
            return {
              email: payload.email,
              name: payload.name,
              picture: payload.picture,
              sub: payload.sub
            };
          }
        } catch (e) {
          console.error('Failed to parse ID token:', e);
        }
      }
      return null;
    }
  }
  
  async refreshToken() {
    const tokens = this.store.get('tokens');
    if (!tokens || !tokens.refresh_token) {
      throw new Error('No refresh token available');
    }
    
    const request = new TokenRequest({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      grant_type: GRANT_TYPE_REFRESH_TOKEN,
      refresh_token: tokens.refresh_token
    });
    
    try {
      const response = await this.tokenHandler.performTokenRequest(this.configuration, request);
      
      // Update stored tokens
      this.store.set('tokens', {
        ...tokens,
        access_token: response.accessToken,
        id_token: response.idToken,
        expires_at: Date.now() + (response.expiresIn || 3600) * 1000
      });
      
      return response;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }
  
  getStoredTokens() {
    return this.store.get('tokens');
  }
  
  async signOut() {
    const tokens = this.store.get('tokens');
    if (tokens && tokens.access_token) {
      // Revoke the token
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `token=${tokens.access_token}`
        });
      } catch (error) {
        console.error('Error revoking token:', error);
      }
    }
    
    // Clear stored tokens
    this.store.delete('tokens');
    this.store.delete('code_verifier');
    
    this.emit('auth-signout');
  }
  
  isAuthenticated() {
    const tokens = this.store.get('tokens');
    console.log('🔵 ElectronAuthFlow: isAuthenticated check - tokens:', !!tokens);
    if (!tokens) {
      console.log('🔵 ElectronAuthFlow: No tokens found in store');
      return false;
    }
    
    console.log('🔵 ElectronAuthFlow: Tokens found, checking expiry...');
    // Check if token is expired
    if (tokens.expires_at && tokens.expires_at < Date.now()) {
      console.log('⚠️ ElectronAuthFlow: Token expired, attempting refresh...');
      // Try to refresh
      this.refreshToken().catch(() => {
        console.log('🔴 ElectronAuthFlow: Token refresh failed, clearing tokens');
        this.store.delete('tokens');
      });
    }
    
    console.log('🟢 ElectronAuthFlow: User is authenticated');
    return true;
  }
  
  buildAuthorizationUrl(configuration, request) {
    const params = new URLSearchParams({
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      response_type: request.responseType,
      scope: request.scope,
      state: request.state,
      ...request.extras
    });
    
    return `${configuration.authorizationEndpoint}?${params.toString()}`;
  }
  
  async startLocalServer(request) {
    if (this.server) {
      await this.stopLocalServer();
    }
    
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        console.log('ElectronAuthFlow: Received request:', req.url);
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/callback') {
          console.log('🔵 ElectronAuthFlow: OAuth callback received on local server');
          const code = parsedUrl.query.code;
          const state = parsedUrl.query.state;
          const error = parsedUrl.query.error;
          console.log('🔵 ElectronAuthFlow: Callback params - code:', !!code, 'state:', state, 'error:', error);
          
          // Send success page to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <h1 style="color: #FF7043; margin-bottom: 16px;">Authentication ${error ? 'Failed' : 'Successful'}</h1>
                  <p style="color: #666; margin-bottom: 24px;">${error ? 'There was an error during authentication.' : 'You can now close this window and return to OnlyJobs Desktop.'}</p>
                  <script>setTimeout(() => window.close(), 3000);</script>
                </div>
              </body>
            </html>
          `);
          
          // Stop the server
          this.stopLocalServer();
          
          // Handle the response
          if (error) {
            console.log('🔴 ElectronAuthFlow: OAuth error:', error);
            this.handleAuthorizationResponse(null, new Error(error));
          } else if (code) {
            // Check state if it exists
            const storedState = this.store.get('auth_state');
            console.log('🔵 ElectronAuthFlow: State check - received:', state, 'stored:', storedState);
            
            // State checking is optional for now since it might be causing issues
            const response = {
              code: code,
              state: state
            };
            console.log('🟢 ElectronAuthFlow: Calling handleAuthorizationResponse with code');
            this.handleAuthorizationResponse(response, null);
          } else {
            console.log('🔴 ElectronAuthFlow: No code in callback');
            this.handleAuthorizationResponse(null, new Error('No authorization code received'));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      this.server.listen(8000, () => {
        console.log('🟢 ElectronAuthFlow: Local server started on http://localhost:8000');
        resolve();
      });
    });
  }
  
  async stopLocalServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }
}

module.exports = ElectronAuthFlow;