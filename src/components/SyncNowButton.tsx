import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import { Sync } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const accent = '#FF7043';

interface SyncNowButtonProps {
  onSyncComplete?: () => void;
  onSyncError?: (error: string) => void;
}

export const SyncNowButton: React.FC<SyncNowButtonProps> = ({
  onSyncComplete,
  onSyncError
}) => {
  const { currentUser, syncIncremental } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!currentUser) {
      onSyncError?.('User not authenticated');
      return;
    }

    setLoading(true);
    try {
      await syncIncremental(currentUser);
      onSyncComplete?.();
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