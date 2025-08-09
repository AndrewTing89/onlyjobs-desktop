const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic event system (standardized)
  on: (channel, callback) => {
    const validChannels = [
      'auth-success', 'auth-error', 'sync-progress', 'sync-complete', 'sync-error', 
      'llm-progress', 'llm-complete', 'llm-error', 'job-found', 'gmail-authenticated',
      'fetch-progress', 'fetch-complete', 'fetch-error',
      'classify-progress', 'classify-complete', 'classify-error', 'oauth-callback'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // System operations
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  showNotification: (title, body) => ipcRenderer.invoke('system:notification', title, body),
  
  // Window operations  
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Database operations (legacy)
  getJobs: (filters) => ipcRenderer.invoke('db:get-jobs', filters),
  getJob: (id) => ipcRenderer.invoke('db:get-job', id),
  createJob: (job) => ipcRenderer.invoke('db:create-job', job),
  updateJob: (id, updates) => ipcRenderer.invoke('db:update-job', id, updates),
  deleteJob: (id) => ipcRenderer.invoke('db:delete-job', id),

  // Email classification (legacy)
  classifyEmail: (content) => ipcRenderer.invoke('classify-email', content),
  parseEmail: (payload) => ipcRenderer.invoke('onlyjobs.parseEmail', payload),

  // OnlyJobs API (main interface)
  onlyjobs: {
    fetchJobInbox: (options) => ipcRenderer.invoke('onlyjobs.fetchJobInbox', options),
    fetchEmailDetail: (options) => ipcRenderer.invoke('onlyjobs.fetchEmailDetail', options),
    fetchApplications: (options) => ipcRenderer.invoke('onlyjobs.fetchApplications', options),
    fetchApplicationTimeline: (options) => ipcRenderer.invoke('onlyjobs.fetchApplicationTimeline', options),
    
    auth: {
      start: () => ipcRenderer.invoke('onlyjobs.auth.start'),
      status: () => ipcRenderer.invoke('onlyjobs.auth.status'),
      disconnect: () => ipcRenderer.invoke('onlyjobs.auth.disconnect'),
      isAuthenticated: () => ipcRenderer.invoke('onlyjobs.auth.status').then(status => {
        return { success: true, authenticated: status?.connected || false };
      }).catch(() => ({ success: false, authenticated: false })),
    },
    
    emails: {
      fetch: (options) => ipcRenderer.invoke('onlyjobs.emails.fetch', options),
    },
  },

  // Unified auth (delegates to onlyjobs.auth)
  auth: {
    signIn: () => ipcRenderer.invoke('onlyjobs.auth.start'),
    signOut: () => ipcRenderer.invoke('onlyjobs.auth.disconnect'),
    getTokens: () => ipcRenderer.invoke('onlyjobs.auth.status'),
    isAuthenticated: () => ipcRenderer.invoke('onlyjobs.auth.status').then(status => {
      return { success: true, authenticated: status?.connected || false };
    }).catch(() => ({ success: false, authenticated: false })),
  },

  // Gmail operations (delegates to onlyjobs)
  gmail: {
    authenticate: () => ipcRenderer.invoke('onlyjobs.auth.start'),
    getAuthStatus: () => ipcRenderer.invoke('onlyjobs.auth.status'),
    fetchEmails: (options) => ipcRenderer.invoke('onlyjobs.emails.fetch', options),
    disconnect: () => ipcRenderer.invoke('onlyjobs.auth.disconnect'),
    sync: (options) => ipcRenderer.invoke('onlyjobs.emails.fetch', options),
    fetch: (options) => ipcRenderer.invoke('onlyjobs.emails.fetch', options),
    getSyncStatus: () => ipcRenderer.invoke('onlyjobs.auth.status'),
    getAccounts: () => ipcRenderer.invoke('gmail:get-accounts'),
    addAccount: () => ipcRenderer.invoke('gmail:add-account'),
    removeAccount: (email) => ipcRenderer.invoke('gmail:remove-account', email),
    syncAll: (options) => ipcRenderer.invoke('gmail:sync-all', options),
  },

  // Direct email operations
  emails: {
    classify: (options) => ipcRenderer.invoke('emails:classify', options),
    fetch: (options) => ipcRenderer.invoke('onlyjobs.emails.fetch', options),
  },

  // ML/LLM operations
  getMlStatus: () => ipcRenderer.invoke('ml:get-status'),
  isMlReady: () => ipcRenderer.invoke('ml:is-ready'),
  trainModel: () => Promise.resolve({ message: 'LLM models do not require training' }),
  initializeMl: () => ipcRenderer.invoke('ml:initialize'),

  // Settings  
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Data import/export
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: (data) => ipcRenderer.invoke('data:import', data),

  // File operations
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),
  saveFile: (data) => ipcRenderer.invoke('dialog:save-file', data),

  // OAuth (legacy)
  initiateOAuth: () => ipcRenderer.invoke('initiate-oauth'),
  notifyOAuthCompleted: (data) => ipcRenderer.invoke('oauth-completed', data)
});

// Expose environment info
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  version: process.versions.electron,
  isDev: process.env.NODE_ENV === 'development'
});

// Expose safe environment variables (fallback for Firebase config)
contextBridge.exposeInMainWorld('env', {
  // Only expose Firebase config if they exist in the main process environment
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || process.env.REACT_APP_FIREBASE_DATABASE_URL,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || process.env.REACT_APP_FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID || process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
});