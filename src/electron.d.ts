interface ElectronAPI {
  // Database operations
  getJobs: (filters?: any) => Promise<any>;
  getJob: (id: string) => Promise<any>;
  createJob: (job: any) => Promise<any>;
  updateJob: (id: string, updates: any) => Promise<any>;
  deleteJob: (id: string) => Promise<any>;
  
  // Email classification
  classifyEmail: (input: string | { subject: string; plaintext: string }) => Promise<any>;
  
  // ML Model operations
  getMlStatus: () => Promise<any>;
  isMlReady: () => Promise<any>;
  trainModel: (options?: any) => Promise<any>;
  initializeMl: () => Promise<any>;
  
  // Authentication operations
  auth: {
    signIn: () => Promise<any>;
    signOut: () => Promise<any>;
    getTokens: () => Promise<any>;
    isAuthenticated: () => Promise<any>;
  };
  
  // Gmail operations
  gmail: {
    authenticate: () => Promise<any>;
    getAuthStatus: () => Promise<any>;
    fetchEmails: (options?: any) => Promise<any>;
    disconnect: () => Promise<any>;
    sync: (options?: { daysToSync?: number; maxEmails?: number }) => Promise<any>;
    fetch: (options?: { daysToSync?: number; maxEmails?: number }) => Promise<any>;
    getSyncStatus: () => Promise<any>;
    // Multi-account operations
    getAccounts: () => Promise<{ success: boolean; accounts: any[] }>;
    addAccount: () => Promise<{ success: boolean; account: { email: string } }>;
    removeAccount: (email: string) => Promise<{ success: boolean }>;
    syncAll: (options?: { daysToSync?: number; maxEmails?: number }) => Promise<any>;
  };
  
  // Email operations
  emails: {
    classify: (options?: { batchSize?: number; maxToProcess?: number }) => Promise<any>;
  };
  
  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;
  
  // Data import/export
  exportData: () => Promise<any>;
  importData: (data: any) => Promise<any>;
  
  // File operations
  selectFile: () => Promise<any>;
  saveFile: (data: any) => Promise<any>;
  
  // System operations
  showNotification: (title: string, body: string) => Promise<any>;
  openExternal: (url: string) => Promise<any>;
  
  // Window operations
  minimizeWindow: () => Promise<any>;
  maximizeWindow: () => Promise<any>;
  closeWindow: () => Promise<any>;
  
  // Event listeners
  onSyncProgress: (callback: (progress: any) => void) => void;
  onSyncComplete: (callback: (result: any) => void) => void;
  onSyncError: (callback: (error: any) => void) => void;
  onMlTrainingComplete: (callback: (result: any) => void) => void;
  onMlTrainingError: (callback: (error: any) => void) => void;
  onSyncNow: (callback: () => void) => void;
  onImportData: (callback: () => void) => void;
  onExportData: (callback: () => void) => void;
  onAuthSuccess: (callback: (data: any) => void) => void;
  onAuthError: (callback: (error: string) => void) => void;
  
  // OAuth handlers
  onOAuthCallback: (callback: (data: any) => void) => void;
  initiateOAuth: () => Promise<any>;
  notifyOAuthCompleted: (data: any) => Promise<any>;
  
  // Generic event listeners
  on: (channel: string, callback: (...args: any[]) => void) => void;
  
  // Remove event listeners
  removeListener: (channel: string, callback: Function) => void;
  removeAllListeners: (channel: string) => void;
}

interface ElectronInfo {
  platform: string;
  version: string;
  isDev: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electronInfo: ElectronInfo;
  }
}

export {};