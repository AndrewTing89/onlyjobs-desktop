// Electron API type definitions

interface Window {
  electronAPI: {
    // Generic event system (standardized)
    on: (channel: string, listener: (...args: any[]) => void) => void;
    removeListener: (channel: string, listener: (...args: any[]) => void) => void;
    removeAllListeners: (channel: string) => void;

    // System operations
    openExternal: (url: string) => Promise<void>;
    showNotification: (title: string, body: string) => Promise<void>;
    
    // Window operations  
    minimizeWindow: () => Promise<void>;
    maximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;

    // Database operations (legacy)
    getJobs: (filters?: any) => Promise<any>;
    getJob: (id: string) => Promise<any>;
    createJob: (job: any) => Promise<any>;
    updateJob: (id: string, updates: any) => Promise<any>;
    deleteJob: (id: string) => Promise<any>;

    // Email classification (legacy)
    classifyEmail: (content: string) => Promise<any>;
    parseEmail: (payload: any) => Promise<any>;

    // OnlyJobs API (main interface)
    onlyjobs: {
      fetchJobInbox: (opts?: any) => Promise<any>;
      fetchEmailDetail: (opts: any) => Promise<any>;
      fetchApplications: (opts?: any) => Promise<any>;
      fetchApplicationTimeline: (opts: any) => Promise<any>;
      
      auth: {
        status: () => Promise<any>;
        start: () => Promise<any>;
        disconnect: () => Promise<void>;
        isAuthenticated: () => Promise<{ success: boolean; authenticated: boolean }>;
      };
      
      emails: {
        fetch: (opts: any) => Promise<{ success: boolean; [key: string]: any }>;
      };
    };

    // Unified auth (delegates to onlyjobs.auth)
    auth: {
      signIn: () => Promise<any>;
      signOut: () => Promise<void>;
      getTokens: () => Promise<any>;
      isAuthenticated: () => Promise<{ success: boolean; authenticated: boolean }>;
    };

    // Gmail operations (delegates to onlyjobs)
    gmail: {
      authenticate: () => Promise<any>;
      getAuthStatus: () => Promise<any>;
      fetchEmails: (opts?: any) => Promise<any>;
      disconnect: () => Promise<void>;
      sync: (opts?: any) => Promise<any>;
      fetch: (opts?: any) => Promise<any>;
      getSyncStatus: () => Promise<any>;
      getAccounts: () => Promise<{ accounts: any[] }>;
      addAccount: () => Promise<any>;
      removeAccount: (email: string) => Promise<void>;
      syncAll: (opts?: any) => Promise<any>;
    };

    // Direct email operations
    emails: {
      classify: (opts?: any) => Promise<any>;
      fetch: (opts?: any) => Promise<any>;
    };

    // ML/LLM operations
    getMlStatus: () => Promise<any>;
    isMlReady: () => Promise<boolean>;
    trainModel: (opts?: any) => Promise<any>;
    initializeMl: () => Promise<void>;

    // Settings  
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<void>;

    // Data import/export
    exportData: () => Promise<any>;
    importData: (data: any) => Promise<void>;

    // File operations
    selectFile: () => Promise<any>;
    saveFile: (data: any) => Promise<void>;

    // OAuth (legacy)
    initiateOAuth: () => Promise<any>;
    notifyOAuthCompleted: (data: any) => Promise<void>;
  };
  
  electronInfo: {
    platform: string;
    version: string;
    isDev: boolean;
  };

  env: {
    FIREBASE_API_KEY?: string;
    FIREBASE_AUTH_DOMAIN?: string;
    FIREBASE_DATABASE_URL?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_STORAGE_BUCKET?: string;
    FIREBASE_MESSAGING_SENDER_ID?: string;
    FIREBASE_APP_ID?: string;
    FIREBASE_MEASUREMENT_ID?: string;
  };
}