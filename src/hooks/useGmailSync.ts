// useGmailSync.ts
import { useState, useCallback } from 'react';
import { gmailService } from '../services/gmail.service';
import { useAuth } from '../contexts/AuthContext';

interface SyncState {
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
  progress: number;
  isConnecting: boolean;
  isConnected: boolean;
  isCheckingStatus: boolean;
}

export function useGmailSync() {
  const { currentUser } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSync: null,
    error: null,
    progress: 0,
    isConnecting: false,
    isConnected: false,
    isCheckingStatus: false,
  });

  const startSync = useCallback(async () => {
    if (!currentUser) {
      setSyncState(prev => ({ ...prev, error: 'User not authenticated' }));
      return;
    }

    setSyncState(prev => ({
      ...prev,
      isSyncing: true,
      error: null,
      progress: 0,
    }));

    try {
      // For now, simulate sync since the sync endpoint isn't implemented yet
      // TODO: Replace with actual sync API call when available
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        lastSync: new Date(),
        progress: 100,
      }));
      
    } catch (error) {
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        progress: 0,
      }));
    }
  }, [currentUser]);

  const connectGmail = useCallback(async () => {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    setSyncState(prev => ({
      ...prev,
      isConnecting: true,
      error: null,
    }));

    try {
      console.log('🔄 Starting OAuth flow...');
      console.log('Current user:', currentUser.email);
      
      const authUrl = await gmailService.getOAuthUrl();
      console.log('✅ OAuth URL retrieved:', authUrl);
      
      // Redirect to OAuth URL - backend will automatically redirect back to frontend
      console.log('🔄 Redirecting to OAuth URL...');
      window.location.href = authUrl;
      
    } catch (error) {
      setSyncState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect Gmail',
      }));
      throw error;
    }
  }, [currentUser]);

  const checkConnectionStatus = useCallback(async () => {
    if (!currentUser) {
      setSyncState(prev => ({ ...prev, isConnected: false }));
      return;
    }

    setSyncState(prev => ({ ...prev, isCheckingStatus: true }));

    try {
      const status = await gmailService.getConnectionStatus();
      setSyncState(prev => ({
        ...prev,
        isConnected: status.connected,
        isCheckingStatus: false,
        error: null,
      }));
    } catch (error) {
      setSyncState(prev => ({
        ...prev,
        isConnected: false,
        isCheckingStatus: false,
        error: error instanceof Error ? error.message : 'Failed to check connection status',
      }));
    }
  }, [currentUser]);

  const disconnectGmail = useCallback(async () => {
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      await gmailService.disconnect();
      setSyncState(prev => ({
        ...prev,
        lastSync: null,
        error: null,
        isConnected: false,
      }));
    } catch (error) {
      setSyncState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to disconnect Gmail',
      }));
      throw error;
    }
  }, [currentUser]);

  return {
    ...syncState,
    startSync,
    connectGmail,
    disconnectGmail,
    checkConnectionStatus,
  };
}