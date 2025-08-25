interface ElectronAPI {
  // Database operations
  getJobs: (filters?: any) => Promise<any>;
  getJob: (id: string) => Promise<any>;
  getJobEmail: (id: string) => Promise<{ success: boolean; emailContent?: string; emailHistory?: any[]; error?: string }>;
  createJob: (job: any) => Promise<any>;
  updateJob: (id: string, updates: any) => Promise<any>;
  deleteJob: (id: string) => Promise<any>;
  
  // Database management operations
  clearAllRecords: () => Promise<{ success: boolean; message: string; details: any }>;
  clearEmailSync: () => Promise<{ success: boolean; message: string; recordsDeleted: number }>;
  
  // Email operations for compatibility
  getJobInbox?: (jobId: string) => Promise<any>;
  getEmailDetail?: (emailId: string) => Promise<any>;
  
  // Email classification
  classifyEmail: (input: string | { subject: string; plaintext: string }) => Promise<any>;
  
  // LLM Health Check
  checkLLMHealth: () => Promise<{
    status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
    modelPath: string;
    modelExists: boolean;
    modelSize: number;
    expectedSize: number;
    canLoad: boolean;
    error: string | null;
    lastChecked: string;
  }>;
  
  // ML Model operations (legacy)
  getMlStatus: () => Promise<any>;
  isMlReady: () => Promise<any>;
  trainModel: (options?: any) => Promise<any>;
  initializeMl: () => Promise<any>;
  
  // ML Classifier operations (Random Forest)
  ml: {
    getStats: () => Promise<{
      success: boolean;
      stats: {
        trained: boolean;
        totalSamples: number;
        jobSamples: number;
        nonJobSamples: number;
        accuracy: number;
        lastTrained: string | null;
        vocabularySize: number;
        modelSize: string;
      };
      error?: string;
    }>;
    retrain: () => Promise<{
      success: boolean;
      stats?: any;
      message?: string;
      error?: string;
    }>;
    submitFeedback: (feedback: {
      emailId: string;
      isJobRelated: boolean;
      company?: string;
      position?: string;
      confidence?: number;
      correctedType?: string;
      correctedCompany?: string;
      correctedPosition?: string;
    }) => Promise<{ success: boolean; error?: string }>;
  };
  
  // Email Review Queue operations
  review: {
    getPending: (options?: {
      confidence_max?: number;
      reviewed?: boolean;
      limit?: number;
    }) => Promise<{
      success: boolean;
      reviews?: any[];
      error?: string;
    }>;
    getStats: () => Promise<{
      success: boolean;
      stats?: {
        total: number;
        pending: number;
        reviewed: number;
        expiringSoon: number;
        byConfidence: Array<{ level: string; count: number }>;
      };
      error?: string;
    }>;
    markJobRelated: (reviewId: string) => Promise<{ success: boolean; error?: string }>;
    confirmNotJob: (reviewId: string) => Promise<{ success: boolean; error?: string }>;
  };
  
  // Prompt management (new API)
  prompt: {
    get: () => Promise<string>;
    save: (prompt: string) => Promise<{ success: boolean }>;
    reset: () => Promise<void>;
  };
  
  // Prompt management (legacy API)
  getPrompt: () => Promise<{ 
    success: boolean; 
    prompt: string; 
    isCustom: boolean;
    tokenInfo?: {
      promptTokens: number;
      contextSize: number;
      availableTokens: number;
      usagePercent: number;
      warning: string | null;
    };
  }>;
  setPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;
  resetPrompt: () => Promise<{ success: boolean; prompt: string }>;
  getPromptInfo: () => Promise<{ success: boolean; modelPath: string; userDataPath: string; promptFilePath: string }>;
  testPrompt: (data: { 
    prompt: string; 
    email: { subject: string; from: string; body: string } 
  }) => Promise<{ success: boolean; result?: any; error?: string }>;
  getTokenInfo: (text: string) => Promise<{
    promptTokens: number;
    contextSize: number;
    availableTokens: number;
    usagePercent: number;
    warning: string | null;
    status: 'good' | 'warning' | 'danger';
  }>;
  
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
  
  // Model testing operations
  models: {
    getAllModels: () => Promise<{ 
      success: boolean; 
      models: Array<{
        id: string;
        name: string;
        filename: string;
        size: number;
        description: string;
      }>;
      statuses: Record<string, {
        status: 'ready' | 'downloading' | 'not_installed' | 'corrupt';
        progress?: number;
        downloadedSize?: number;
        totalSize?: number;
        size?: number;
        path?: string;
      }>;
    }>;
    downloadModel: (modelId: string) => Promise<{ success: boolean; result?: any; error?: string }>;
    deleteModel: (modelId: string) => Promise<{ success: boolean; deleted: boolean; error?: string }>;
    runComparison: (data: { subject: string; body: string; customPrompt?: string }) => Promise<{ 
      success: boolean;
      subject: string;
      results: Array<{
        modelId: string;
        result: {
          is_job_related: boolean;
          company: string | null;
          position: string | null;
          status: string | null;
          error?: string;
        };
        processingTime: number;
        rawResponse: string | null;
        error?: string;
      }>;
      timestamp: string;
      error?: string;
    }>;
    getDefaultPrompts: () => Promise<{ 
      success: boolean;
      prompts: Record<string, string>;
      error?: string;
    }>;
    getRecentEmails: () => Promise<{
      success: boolean;
      emails: Array<{
        id: string;
        subject: string;
        from: string;
        body: string;
        date: string;
      }>;
      error?: string;
    }>;
    getTestHistory: () => Promise<{ 
      success: boolean;
      history: Array<{
        subject: string;
        results: Array<{
          modelId: string;
          result: {
            is_job_related: boolean;
            company: string | null;
            position: string | null;
            status: string | null;
            error?: string;
          };
          processingTime: number;
          rawResponse: string | null;
        }>;
        timestamp: string;
      }>;
    }>;
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