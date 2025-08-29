// Electron API type definitions
declare global {
  interface Window {
    electronAPI: {
      // Database operations
      getJobs: (filters?: any) => Promise<any>;
      getJob: (id: string) => Promise<any>;
      createJob: (job: any) => Promise<any>;
      updateJob: (id: string, updates: any) => Promise<any>;
      deleteJob: (id: string) => Promise<any>;
      
      // Database management operations
      clearAllRecords: () => Promise<{ success: boolean; message: string; details: any }>;
      clearEmailSync: () => Promise<{ success: boolean; message: string; recordsDeleted: number }>;
      clearJobData: () => Promise<{ success: boolean; message: string; emailSyncDeleted: number; jobsDeleted: number; gmailAccountsKept: number }>;
      clearClassifications: () => Promise<{ success: boolean; message: string; classificationQueueDeleted: number; trainingFeedbackDeleted: number; llmCacheDeleted: number }>;
      
      // Email classification
      classifyEmail: (input: string | { subject: string; plaintext: string }) => Promise<any>;
      getClassificationQueue: (filters?: any) => Promise<{ success: boolean; emails: any[]; stats: any }>;
      updateClassification: (id: string, isJobRelated: boolean, notes?: string) => Promise<any>;
      
      // Gmail operations
      authenticateGmail: () => Promise<any>;
      syncEmails: () => Promise<any>;
      getSyncStatus: () => Promise<any>;
      
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
      
      // ML operations
      getMlStatus: () => Promise<any>;
      isMlReady: () => Promise<any>;
      trainModel: (options?: any) => Promise<any>;
      initializeMl: () => Promise<any>;
      
      // Prompt management
      getPrompt: () => Promise<{ success: boolean; prompt: string; isCustom: boolean }>;
      setPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;
      resetPrompt: () => Promise<{ success: boolean; prompt: string }>;
      getPromptInfo: () => Promise<{ success: boolean; modelPath: string; userDataPath: string; promptFilePath: string }>;
      
      // Event listeners
      onSyncProgress: (callback: (progress: any) => void) => void;
      onSyncComplete: (callback: (result: any) => void) => void;
      onSyncError: (callback: (error: any) => void) => void;
      onSyncNow: (callback: () => void) => void;
      onImportData: (callback: () => void) => void;
      onExportData: (callback: () => void) => void;
      onMlTrainingComplete: (callback: (result: any) => void) => void;
      onMlTrainingError: (callback: (error: any) => void) => void;
      
      // Remove event listeners
      removeAllListeners: (channel: string) => void;
      
      // OAuth handlers
      onOAuthCallback: (callback: (data: any) => void) => void;
      initiateOAuth: () => Promise<void>;
    };
    
    electronInfo: {
      platform: string;
      version: string;
      isDev: boolean;
    };
  }
}

export {};