import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Sync as SyncIcon,
  Email as EmailIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { SyncActivityLog, SyncLogEntry } from './SyncActivityLog';

interface GmailAccount {
  id: string;
  email: string;
  connected_at: string;
  last_sync: string | null;
  is_active: boolean;
  sync_enabled: boolean;
}

interface SyncProgress {
  current: number;
  total: number;
  status: string;
  account?: string;
  emailProgress?: {
    current: number;
    total: number;
  };
  phase?: 'fetching' | 'classifying' | 'saving';
  details?: string;
}

export const GmailMultiAccount: React.FC = () => {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [daysToSync, setDaysToSync] = useState<number>(365); // Default to 1 year for better results
  const [syncStats, setSyncStats] = useState<{processed?: number; found?: number; skipped?: number}>({});
  const [syncActivityLog, setSyncActivityLog] = useState<SyncLogEntry[]>([]);

  useEffect(() => {
    loadAccounts();
    
    // Listen for sync progress
    window.electronAPI.on('sync-progress', (progress: SyncProgress) => {
      setSyncProgress(progress);
    });
    
    // Listen for sync activity events
    window.electronAPI.on('sync-activity', (event: any) => {
      setSyncActivityLog(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type: event.type,
        message: event.message,
        details: event.details
      } as SyncLogEntry]);
    });
    
    window.electronAPI.on('sync-complete', (result: any) => {
      setSyncing(false);
      setSyncProgress(null);
      setSyncStats({
        processed: result.emailsFetched || 0,
        found: result.jobsFound || 0,
        skipped: result.emailsSkipped || 0
      });
      const message = `Sync complete! Processed ${result.emailsFetched || 0} emails • Found ${result.jobsFound || 0} job applications`;
      if (result.emailsSkipped > 0) {
        setSuccessMessage(message + ` • Skipped ${result.emailsSkipped} already processed emails`);
      } else {
        setSuccessMessage(message);
      }
      loadAccounts(); // Refresh accounts to show updated sync times
    });
    
    window.electronAPI.on('sync-error', (error: any) => {
      setSyncing(false);
      setSyncProgress(null);
      setError(`Sync error: ${error.message}`);
    });
    
    return () => {
      window.electronAPI.removeAllListeners('sync-progress');
      window.electronAPI.removeAllListeners('sync-activity');
      window.electronAPI.removeAllListeners('sync-complete');
      window.electronAPI.removeAllListeners('sync-error');
    };
  }, []);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI.gmail.getAccounts();
      setAccounts(result.accounts);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
    }
  };

  const handleAddAccount = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.gmail.addAccount();
      setSuccessMessage(`Successfully connected ${result.account.email}`);
      await loadAccounts();
    } catch (err: any) {
      setError(`Failed to add account: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (email: string) => {
    try {
      await window.electronAPI.gmail.removeAccount(email);
      setConfirmDelete(null);
      setSuccessMessage(`Removed ${email}`);
      await loadAccounts();
    } catch (err: any) {
      setError(`Failed to remove account: ${err.message}`);
    }
  };

  const handleSyncAll = async () => {
    if (accounts.length === 0) {
      setError('No accounts connected. Please add a Gmail account first.');
      return;
    }
    
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    setSyncActivityLog([]); // Clear previous activity log
    
    try {
      // Use classification-only sync for HIL workflow
      await window.electronAPI.gmail.syncClassifyOnly({
        daysToSync: daysToSync,
        maxEmails: 1000  // Maximum allowed per sync
      });
    } catch (err: any) {
      setSyncing(false);
      setError(`Sync failed: ${err.message}`);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon />
            Gmail Accounts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Connect multiple Gmail accounts to sync job applications from all your email addresses.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddAccount}
          disabled={loading || syncing}
          sx={{ flexShrink: 0 }}
        >
          {loading ? 'Connecting...' : 'Add Gmail Account'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <List>
          {accounts.length === 0 ? (
            <ListItem>
              <ListItemText 
                primary="No accounts connected"
                secondary="Add a Gmail account to start syncing job applications"
              />
            </ListItem>
          ) : (
            accounts.map((account) => (
              <ListItem key={account.id}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {account.email}
                      {account.sync_enabled && (
                        <Chip 
                          size="small" 
                          label="Sync enabled" 
                          color="success" 
                          icon={<CheckCircleIcon />}
                        />
                      )}
                    </Box>
                  }
                  secondary={`Connected: ${formatDate(account.connected_at)} • Last sync: ${formatDate(account.last_sync)}`}
                />
                <ListItemSecondaryAction>
                  <IconButton 
                    edge="end" 
                    onClick={() => setConfirmDelete(account.email)}
                    disabled={syncing}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))
          )}
        </List>
      </Paper>

      {/* Sync Controls Row */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          label="Days to sync"
          type="number"
          value={daysToSync}
          onChange={(e) => setDaysToSync(Math.max(1, Math.min(3650, parseInt(e.target.value) || 1)))}
          inputProps={{
            min: 1,
            max: 3650,
            onKeyDown: (e: React.KeyboardEvent) => {
              // Enable Cmd+A (Mac) and Ctrl+A (Windows/Linux) to select all
              if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                const target = e.target as HTMLInputElement;
                target.select();
              }
            }
          }}
          size="small"
          sx={{ width: 200 }}
        />
        
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={handleSyncAll}
          disabled={syncing || accounts.length === 0}
          size="medium"
          sx={{ 
            height: '40px',
            minWidth: 200,
            color: '#FF7043',
            borderColor: '#FF7043',
            '&:hover': {
              borderColor: '#FF7043',
              backgroundColor: 'rgba(255, 112, 67, 0.04)'
            },
            '&:disabled': {
              borderColor: 'rgba(0, 0, 0, 0.12)',
              color: 'rgba(0, 0, 0, 0.26)'
            }
          }}
        >
          Sync All Accounts ({daysToSync} days)
        </Button>
      </Box>

      {syncing && syncProgress && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="subtitle1">
              Syncing Emails
            </Typography>
            {syncProgress.phase && (
              <Chip 
                size="small" 
                label={syncProgress.phase.charAt(0).toUpperCase() + syncProgress.phase.slice(1)}
                color={syncProgress.phase === 'fetching' ? 'info' : syncProgress.phase === 'classifying' ? 'warning' : 'success'}
              />
            )}
          </Box>
          
          {/* Main status text */}
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {syncProgress.status}
          </Typography>
          
          {/* Detailed progress info */}
          {syncProgress.details && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {syncProgress.details}
            </Typography>
          )}
          
          {/* Account progress bar */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Account {syncProgress.current + 1} of {syncProgress.total}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round((syncProgress.current / syncProgress.total) * 100)}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
          
          {/* Email progress bar if processing emails */}
          {syncProgress.emailProgress && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Email {syncProgress.emailProgress.current} of {syncProgress.emailProgress.total}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {Math.round((syncProgress.emailProgress.current / syncProgress.emailProgress.total) * 100)}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(syncProgress.emailProgress.current / syncProgress.emailProgress.total) * 100}
                sx={{ height: 6, borderRadius: 3 }}
                color="secondary"
              />
            </Box>
          )}
          
          {/* Live stats */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              📧 Processing: {syncProgress.emailProgress?.current || 0} emails
            </Typography>
            {syncStats.skipped && syncStats.skipped > 0 && (
              <Typography variant="caption" color="text.secondary">
                ⏭️ Skipped: {syncStats.skipped} (already processed)
              </Typography>
            )}
          </Box>
        </Paper>
      )}
      
      {/* Live Activity Log */}
      {syncing && (
        <Box sx={{ mt: 2 }}>
          <SyncActivityLog entries={syncActivityLog} />
        </Box>
      )}

      {/* Sync History Summary */}
      {syncStats.processed !== undefined && !syncing && (
        <Paper sx={{ p: 2, mt: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" gutterBottom>
            Last Sync Summary
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" color="primary">
                {syncStats.processed || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Emails Processed
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" color="success.main">
                {syncStats.found || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Jobs Found
              </Typography>
            </Box>
            {syncStats.skipped && syncStats.skipped > 0 && (
              <Box>
                <Typography variant="h6" color="text.secondary">
                  {syncStats.skipped}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Already Processed
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Remove Gmail Account</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {confirmDelete}? 
            This will stop syncing from this account, but won't delete any existing jobs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button 
            onClick={() => confirmDelete && handleRemoveAccount(confirmDelete)} 
            color="error"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};