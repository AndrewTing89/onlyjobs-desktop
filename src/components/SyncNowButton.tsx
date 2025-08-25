import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import { Sync } from '@mui/icons-material';
import { useAuth } from '../contexts/ElectronAuthContext';

const accent = '#FF7043';

interface SyncNowButtonProps {
  onSyncComplete?: () => void;
  onSyncError?: (error: string) => void;
}

export const SyncNowButton: React.FC<SyncNowButtonProps> = ({
  onSyncComplete,
  onSyncError
}) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!currentUser) {
      onSyncError?.('User not authenticated');
      return;
    }

    // In Electron app, sync is handled through IPC
    if (!window.electronAPI) {
      onSyncError?.('Sync not available in this environment');
      return;
    }

    setLoading(true);
    try {
      // Call the Electron IPC handler for syncing all Gmail accounts
      const result = await window.electronAPI.gmail.syncAll();
      if (result && result.success) {
        onSyncComplete?.();
      } else if (result && result.error) {
        throw new Error(result.error);
      } else {
        // If syncAll returns data directly, consider it successful
        onSyncComplete?.();
      }
    } catch (error) {
      console.error('Sync Now failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      onSyncError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outlined"
      onClick={handleClick}
      disabled={loading}
      startIcon={
        loading ? (
          <CircularProgress size={20} sx={{ color: accent }} />
        ) : (
          <Sync />
        )
      }
      sx={{
        borderColor: accent,
        color: accent,
        borderRadius: 2,
        textTransform: 'none',
        fontWeight: 600,
        '&:hover': {
          borderColor: accent,
          backgroundColor: `${accent}10`,
        },
        '&:disabled': {
          borderColor: '#ccc',
          color: '#ccc',
        },
      }}
    >
      {loading ? 'Syncing...' : 'Sync Now'}
    </Button>
  );
};