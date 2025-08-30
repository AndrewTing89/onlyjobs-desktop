const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getJobs: (filters) => ipcRenderer.invoke('db:get-jobs', filters),
  getJobsForModel: (modelId, filters) => ipcRenderer.invoke('db:get-jobs-for-model', modelId, filters),
  getJob: (id) => ipcRenderer.invoke('db:get-job', id),
  getJobEmail: (id) => ipcRenderer.invoke('db:get-job-email', id),
  createJob: (job) => ipcRenderer.invoke('db:create-job', job),
  updateJob: (id, updates) => ipcRenderer.invoke('db:update-job', id, updates),
  deleteJob: (id) => ipcRenderer.invoke('db:delete-job', id),
  
  // Database management operations
  clearAllRecords: () => ipcRenderer.invoke('db:clear-all-records'),
  clearEmailSync: () => ipcRenderer.invoke('db:clear-email-sync'),
  clearJobData: () => ipcRenderer.invoke('db:clear-job-data'),
  clearClassifications: () => ipcRenderer.invoke('db:clear-classifications'),
  
  // Email classification
  classifyEmail: (content) => ipcRenderer.invoke('classify-email', content),
  getClassificationQueue: (filters) => ipcRenderer.invoke('classification:get-queue', filters),
  updateClassification: (id, isJobRelated, notes) => ipcRenderer.invoke('classification:update', id, isJobRelated, notes),
  
  // LLM Health Check
  checkLLMHealth: () => ipcRenderer.invoke('llm:health-check'),
  
  // ML Model operations (legacy)
  getMlStatus: () => ipcRenderer.invoke('ml:get-status'),
  isMlReady: () => ipcRenderer.invoke('ml:is-ready'),
  trainModel: (options) => ipcRenderer.invoke('ml:train-model', options),
  initializeMl: () => ipcRenderer.invoke('ml:initialize'),
  
  // ML Classifier operations (Random Forest)
  ml: {
    getStats: () => ipcRenderer.invoke('ml:get-stats'),
    retrain: () => ipcRenderer.invoke('ml:retrain'),
    submitFeedback: (feedback) => ipcRenderer.invoke('ml:submit-feedback', feedback),
  },
  
  // Email Review Queue operations
  review: {
    getPending: (options) => ipcRenderer.invoke('review:get-pending', options),
    getStats: () => ipcRenderer.invoke('review:get-stats'),
    markJobRelated: (reviewId) => ipcRenderer.invoke('review:mark-job-related', reviewId),
    confirmNotJob: (reviewId) => ipcRenderer.invoke('review:confirm-not-job', reviewId),
  },
  
  // Prompt management
  prompt: {
    get: () => ipcRenderer.invoke('prompt:get'),
    save: (prompt) => ipcRenderer.invoke('prompt:save', prompt),
    reset: () => ipcRenderer.invoke('prompt:reset'),
  },
  getPrompt: () => ipcRenderer.invoke('prompt:get'),
  setPrompt: (prompt) => ipcRenderer.invoke('prompt:set', prompt),
  resetPrompt: () => ipcRenderer.invoke('prompt:reset'),
  getPromptInfo: () => ipcRenderer.invoke('prompt:info'),
  testPrompt: (data) => ipcRenderer.invoke('prompt:test', data),
  getTokenInfo: (text) => ipcRenderer.invoke('prompt:token-info', text),
  
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
    sync: (options) => ipcRenderer.invoke('gmail:sync-all', options), // Map sync to sync-all
    cancelSync: () => ipcRenderer.invoke('gmail:cancel-sync'),
    fetch: (options) => ipcRenderer.invoke('gmail:fetch', options),
    getSyncStatus: () => ipcRenderer.invoke('gmail:get-sync-status'),
    // Multi-account operations
    getAccounts: () => ipcRenderer.invoke('gmail:get-accounts'),
    addAccount: () => ipcRenderer.invoke('gmail:add-account'),
    removeAccount: (email) => ipcRenderer.invoke('gmail:remove-account', email),
    syncAll: (options) => ipcRenderer.invoke('gmail:sync-all', options),
    syncClassifyOnly: (options) => ipcRenderer.invoke('sync:classify-only', options),
  },
  
  // Email operations
  emails: {
    classify: (options) => ipcRenderer.invoke('emails:classify', options),
  },
  
  // Model testing operations
  models: {
    getAllModels: () => ipcRenderer.invoke('models:get-all'),
    downloadModel: (modelId) => ipcRenderer.invoke('models:download', modelId),
    deleteModel: (modelId) => ipcRenderer.invoke('models:delete', modelId),
    runComparison: (data) => ipcRenderer.invoke('models:run-comparison', data),
    getDefaultPrompts: () => ipcRenderer.invoke('models:get-default-prompts'),
    getRecentEmails: () => ipcRenderer.invoke('models:get-recent-emails'),
    getTestHistory: () => ipcRenderer.invoke('models:get-test-history'),
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
      'classify-progress', 'classify-complete', 'classify-error',
      'sync-activity'  // Added for live classification activity logging
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
  notifyOAuthCompleted: (data) => ipcRenderer.invoke('oauth-completed', data),
  
  // Two-Stage LLM Classification
  twoStage: {
    getPrompts: (modelId) => ipcRenderer.invoke('two-stage:get-prompts', modelId),
    saveStage1: (modelId, prompt) => ipcRenderer.invoke('two-stage:save-stage1', modelId, prompt),
    saveStage2: (modelId, prompt) => ipcRenderer.invoke('two-stage:save-stage2', modelId, prompt),
    saveStage3: (modelId, prompt) => ipcRenderer.invoke('two-stage:save-stage3', modelId, prompt),
    resetPrompts: (modelId) => ipcRenderer.invoke('two-stage:reset-prompts', modelId),
    classify: (modelId, modelPath, emailSubject, emailBody) => 
      ipcRenderer.invoke('two-stage:classify', modelId, modelPath, emailSubject, emailBody),
    classifyAndSaveTest: (modelId, modelPath, email) =>
      ipcRenderer.invoke('two-stage:classify-and-save-test', modelId, modelPath, email),
    getTestResults: (modelId) =>
      ipcRenderer.invoke('two-stage:get-test-results', modelId),
    clearTestResults: (modelId) =>
      ipcRenderer.invoke('two-stage:clear-test-results', modelId)
  }
});

// Expose environment info
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  version: process.versions.electron,
  isDev: process.env.NODE_ENV === 'development'
});