const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getJobs: (filters) => ipcRenderer.invoke('db:get-jobs', filters),
  getJob: (id) => ipcRenderer.invoke('db:get-job', id),
  createJob: (job) => ipcRenderer.invoke('db:create-job', job),
  updateJob: (id, updates) => ipcRenderer.invoke('db:update-job', id, updates),
  deleteJob: (id) => ipcRenderer.invoke('db:delete-job', id),
  
  // Email classification
  classifyEmail: (content) => ipcRenderer.invoke('classify-email', content),
  
  // ML Model operations
  getMlStatus: () => ipcRenderer.invoke('ml:get-status'),
  isMlReady: () => ipcRenderer.invoke('ml:is-ready'),
  trainModel: (options) => ipcRenderer.invoke('ml:train-model', options),
  initializeMl: () => ipcRenderer.invoke('ml:initialize'),
  
  // Authentication operations
  auth: {
    signIn: () => ipcRenderer.invoke('auth:sign-in'),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    getTokens: () => ipcRenderer.invoke('auth:get-tokens'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
  },
  
  // Gmail operations
  gmail: {
    authenticate: () => ipcRenderer.invoke('gmail:authenticate'),
    getAuthStatus: () => ipcRenderer.invoke('gmail:get-auth-status'),
    fetchEmails: (options) => ipcRenderer.invoke('gmail:fetch-emails', options),
    disconnect: () => ipcRenderer.invoke('gmail:disconnect'),
    sync: (options) => ipcRenderer.invoke('gmail:sync', options),
    fetch: (options) => ipcRenderer.invoke('gmail:fetch', options),
    getSyncStatus: () => ipcRenderer.invoke('gmail:get-sync-status'),
    // Multi-account operations
    getAccounts: () => ipcRenderer.invoke('gmail:get-accounts'),
    addAccount: () => ipcRenderer.invoke('gmail:add-account'),
    removeAccount: (email) => ipcRenderer.invoke('gmail:remove-account', email),
    syncAll: (options) => ipcRenderer.invoke('gmail:sync-all', options),
  },
  
  // Email operations
  emails: {
    classify: (options) => ipcRenderer.invoke('emails:classify', options),
  },
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  
  // Data import/export
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: (data) => ipcRenderer.invoke('data:import', data),
  
  // File operations
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),
  saveFile: (data) => ipcRenderer.invoke('dialog:save-file', data),
  
  // System operations
  showNotification: (title, body) => ipcRenderer.invoke('system:notification', title, body),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  
  // Window operations
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  
  // Event listeners
  onSyncProgress: (callback) => {
    ipcRenderer.on('sync-progress', (event, progress) => callback(progress));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (event, result) => callback(result));
  },
  onSyncError: (callback) => {
    ipcRenderer.on('sync-error', (event, error) => callback(error));
  },
  onMlTrainingComplete: (callback) => {
    ipcRenderer.on('ml-training-complete', (event, result) => callback(result));
  },
  onMlTrainingError: (callback) => {
    ipcRenderer.on('ml-training-error', (event, error) => callback(error));
  },
  onSyncNow: (callback) => {
    ipcRenderer.on('sync-now', () => callback());
  },
  onImportData: (callback) => {
    ipcRenderer.on('import-data', () => callback());
  },
  onExportData: (callback) => {
    ipcRenderer.on('export-data', () => callback());
  },
  onAuthSuccess: (callback) => {
    ipcRenderer.on('auth-success', (event, data) => callback(data));
  },
  onAuthError: (callback) => {
    ipcRenderer.on('auth-error', (event, error) => callback(error));
  },
  
  // Generic event listeners
  on: (channel, callback) => {
    const validChannels = [
      'auth-success', 'auth-error', 'sync-progress', 'sync-complete', 'sync-error', 
      'ml-training-complete', 'ml-training-error', 'job-found', 'gmail-authenticated',
      'fetch-progress', 'fetch-complete', 'fetch-error',
      'classify-progress', 'classify-complete', 'classify-error'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  // Remove event listeners
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // OAuth handlers
  onOAuthCallback: (callback) => {
    ipcRenderer.on('oauth-callback', (event, data) => callback(data));
  },
  initiateOAuth: () => ipcRenderer.invoke('initiate-oauth'),
  notifyOAuthCompleted: (data) => ipcRenderer.invoke('oauth-completed', data)
});

// Expose environment info
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  version: process.versions.electron,
  isDev: process.env.NODE_ENV === 'development'
});