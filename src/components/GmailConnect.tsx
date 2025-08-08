import React from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Chip, 
  CircularProgress,
  Alert
} from '@mui/material';
import { 
  Email as EmailIcon, 
  Refresh as RefreshIcon,
  CloudDownload as SyncIcon
} from '@mui/icons-material';

interface AuthStatus {
  connected: boolean;
  accountEmail?: string;
}

interface GmailConnectProps {
  onJobsUpdated?: () => void;
}

export default function GmailConnect({ onJobsUpdated }: GmailConnectProps) {
  const [loading, setLoading] = React.useState(false);
  const [syncLoading, setSyncLoading] = React.useState(false);
  const [status, setStatus] = React.useState<AuthStatus>({ connected: false });
  const [error, setError] = React.useState<string | null>(null);

  const checkStatus = React.useCallback(async () => {
    try {
      const result = await window.electronAPI?.onlyjobs?.auth?.status();
      if (result) {
        setStatus(result);
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
    }
  }, []);

  React.useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await window.electronAPI.onlyjobs.auth.start();
      setStatus({ connected: true, accountEmail: res.accountEmail });
      setError(null);
    } catch (e: any) {
      console.error('Gmail auth error:', e);
      setError(e?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    try {
      setLoading(true);
      await window.electronAPI.onlyjobs.auth.disconnect();
      setStatus({ connected: false });
      setError(null);
    } catch (e: any) {
      console.error('Gmail disconnect error:', e);
      setError(e?.message || 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  const syncJobs = async () => {
    try {
      setSyncLoading(true);
      setError(null);
      const result = await window.electronAPI.onlyjobs.emails.fetch({ limit: 50, save: true });
      if (result.success) {
        setError(null);
        // Notify parent to refresh jobs list
        if (onJobsUpdated) {
          onJobsUpdated();
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Email fetch failed');
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <EmailIcon color="primary" />
        <Typography variant="h6">Gmail Connection</Typography>
        <Button
          size="small"
          variant="outlined" 
          startIcon={<RefreshIcon />}
          onClick={checkStatus}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="body1">Status:</Typography>
        {status.connected ? (
          <Chip
            label={`Connected${status.accountEmail ? ` (${status.accountEmail})` : ''}`}
            color="success"
            variant="outlined"
          />
        ) : (
          <Chip
            label="Not connected"
            color="default" 
            variant="outlined"
          />
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {!status.connected ? (
          <Button
            variant="contained"
            onClick={connect}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <EmailIcon />}
          >
            {loading ? 'Connecting…' : 'Connect Gmail'}
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={disconnect}
              disabled={loading}
              color="error"
            >
              {loading ? 'Disconnecting…' : 'Disconnect'}
            </Button>
            <Button
              variant="contained"
              onClick={syncJobs}
              disabled={syncLoading}
              startIcon={syncLoading ? <CircularProgress size={16} /> : <SyncIcon />}
              color="secondary"
            >
              {syncLoading ? 'Syncing…' : 'Fetch Latest 50'}
            </Button>
          </>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Connect your Gmail account to automatically fetch and parse job application emails.
      </Typography>
    </Box>
  );
}