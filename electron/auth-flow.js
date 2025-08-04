const { AuthorizationRequest, AuthorizationNotifier, AuthorizationServiceConfiguration, BaseTokenRequestHandler, TokenRequest, GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN } = require('@openid/appauth');
const { NodeBasedHandler } = require('@openid/appauth/built/node_support/node_request_handler');
const { NodeCrypto } = require('@openid/appauth/built/node_support/crypto_utils');
const { NodeRequestor } = require('@openid/appauth/built/node_support/node_requestor');
const { BrowserWindow } = require('electron');
const EventEmitter = require('events');
const Store = require('electron-store').default || require('electron-store');
const http = require('http');
const url = require('url');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

class ElectronAuthFlow extends EventEmitter {
  constructor() {
    super();
    this.store = new Store({ name: 'auth' });
    this.crypto = new NodeCrypto();
    this.notifier = new AuthorizationNotifier();
    this.authorizationHandler = new NodeBasedHandler();
    this.tokenHandler = new BaseTokenRequestHandler(new NodeRequestor());
    
    // OAuth configuration for Google
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '12002195951-6s2kd59s10acoh6bb43fq2dif0m5volv.apps.googleusercontent.com';
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:8000/callback';
    this.scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels';
    this.server = null;
    
    if (!this.clientSecret) {
      console.warn('Warning: No client secret provided. OAuth may fail.');
    }
    
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
    
    // Create the authorization request with NodeCrypto
    const request = new AuthorizationRequest({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      state: undefined,
      extras: { 'prompt': 'select_account' }
    }, this.crypto);
    
    console.log('ElectronAuthFlow: Auth request created with redirect URI:', this.redirectUri);
    
    // Generate code verifier for PKCE
    await request.setupCodeVerifier();
    
    // Access code verifier from internal property
    const codeVerifier = request.internal?.code_verifier;
    
    // Store the code verifier
    if (codeVerifier) {
      this.store.set('code_verifier', codeVerifier);
      console.log('ElectronAuthFlow: Code verifier stored');
    } else {
      console.error('ElectronAuthFlow: No code verifier generated');
      throw new Error('Failed to generate code verifier');
    }
    
    // Make the authorization request
    console.log('ElectronAuthFlow: Performing authorization request...');
    this.authorizationHandler.performAuthorizationRequest(this.configuration, request);
  }
  
  async handleAuthorizationResponse(response) {
    console.log('ElectronAuthFlow: Handling authorization response');
    if (!response.code) {
      this.emit('auth-error', 'No authorization code received');
      return;
    }
    
    // Get stored code verifier
    const codeVerifier = this.store.get('code_verifier');
    
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
    
    try {
      // Exchange code for tokens
      const tokenResponse = await this.tokenHandler.performTokenRequest(this.configuration, tokenRequest);
      
      // Store tokens
      this.store.set('tokens', {
        access_token: tokenResponse.accessToken,
        id_token: tokenResponse.idToken,
        refresh_token: tokenResponse.refreshToken,
        expires_at: Date.now() + (tokenResponse.expiresIn || 3600) * 1000
      });
      
      // Get user info
      const userInfo = await this.getUserInfo(tokenResponse.accessToken);
      
      // Emit success event
      console.log('Auth successful, emitting auth-success event');
      this.emit('auth-success', {
        tokens: tokenResponse,
        user: userInfo
      });
      
    } catch (error) {
      console.error('Token exchange error:', error);
      this.emit('auth-error', error);
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
      
      return await response.json();
    } catch (error) {
      console.error('Error getting user info:', error);
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
    if (!tokens) return false;
    
    // Check if token is expired
    if (tokens.expires_at && tokens.expires_at < Date.now()) {
      // Try to refresh
      this.refreshToken().catch(() => {
        this.store.delete('tokens');
      });
    }
    
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
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code;
          const state = parsedUrl.query.state;
          const error = parsedUrl.query.error;
          
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
            this.notifier.onAuthorizationComplete(request, null, new Error(error));
          } else if (code && state === request.state) {
            const response = {
              code: code,
              state: state
            };
            this.notifier.onAuthorizationComplete(request, response, null);
          } else {
            this.notifier.onAuthorizationComplete(request, null, new Error('Invalid response'));
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      this.server.listen(8000, () => {
        console.log('Local server started on http://localhost:8000');
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