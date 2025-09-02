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
  accountIndex?: number;
  totalAccounts?: number;
  currentAccount?: string;
  stage?: string;
  progress?: number;
}

export const GmailMultiAccount: React.FC = () => {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{from: string; to: string}>(() => {
    // Default to last 90 days
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    return {
      from: ninetyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0]
    };
  });
  const [syncStats, setSyncStats] = useState<{processed?: number; found?: number; skipped?: number; digestsFiltered?: number; needsReview?: number; syncDuration?: number; emailsPerSecond?: number}>({});
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
        skipped: result.emailsSkipped || 0,
        digestsFiltered: result.digestsFiltered || 0,
        needsReview: result.needsReview || 0,
        syncDuration: result.syncDuration || 0,
        emailsPerSecond: result.emailsPerSecond || 0
      });
      const timeMsg = result.syncDuration ? ` in ${result.syncDuration.toFixed(1)}s (${result.emailsPerSecond} emails/sec)` : '';
      const message = `Sync complete! Processed ${result.emailsFetched || 0} emails${timeMsg} • ${result.digestsFiltered || 0} digests filtered • ${result.jobsFound || 0} job-related`;
      if (result.needsReview > 0) {
        setSuccessMessage(message + ` • ${result.needsReview} need review`);
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
        dateFrom: dateRange.from,
        dateTo: dateRange.to
        // No limit - fetch all emails in date range
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
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <TextField
            label="From Date"
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 160 }}
          />
          
          <TextField
            label="To Date"
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ width: 160 }}
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
            Sync All Accounts
          </Button>
        </Box>
        
        {/* Quick date range presets */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              const today = new Date();
              const sevenDaysAgo = new Date(today);
              sevenDaysAgo.setDate(today.getDate() - 7);
              setDateRange({
                from: sevenDaysAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0]
              });
            }}
          >
            Last 7 days
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              const today = new Date();
              const thirtyDaysAgo = new Date(today);
              thirtyDaysAgo.setDate(today.getDate() - 30);
              setDateRange({
                from: thirtyDaysAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0]
              });
            }}
          >
            Last 30 days
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              const today = new Date();
              const ninetyDaysAgo = new Date(today);
              ninetyDaysAgo.setDate(today.getDate() - 90);
              setDateRange({
                from: ninetyDaysAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0]
              });
            }}
          >
            Last 90 days
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              const today = new Date();
              const oneYearAgo = new Date(today);
              oneYearAgo.setFullYear(today.getFullYear() - 1);
              setDateRange({
                from: oneYearAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0]
              });
            }}
          >
            Last year
          </Button>
        </Box>
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
                {syncProgress.accountIndex && syncProgress.totalAccounts 
                  ? `Account ${syncProgress.accountIndex} of ${syncProgress.totalAccounts}`
                  : syncProgress.currentAccount 
                    ? `Processing ${syncProgress.currentAccount}`
                    : syncProgress.stage || 'Processing...'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {syncProgress.progress || 0}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={syncProgress.progress || 0}
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">
              Last Sync Summary
            </Typography>
            {syncStats.syncDuration && (
              <Typography variant="caption" color="text.secondary">
                ⚡ {syncStats.syncDuration.toFixed(1)}s • {syncStats.emailsPerSecond} emails/sec
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" color="primary">
                {syncStats.processed || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Emails Processed
              </Typography>
            </Box>
            {syncStats.syncDuration && (
              <Box>
                <Typography variant="h6" color="info.main">
                  {syncStats.syncDuration.toFixed(1)}s
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Duration ({syncStats.emailsPerSecond}/sec)
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="h6" color="warning.main">
                {syncStats.digestsFiltered || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Digests Filtered
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" color="success.main">
                {syncStats.found || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Job-Related
              </Typography>
            </Box>
            {syncStats.needsReview && syncStats.needsReview > 0 && (
              <Box>
                <Typography variant="h6" color="info.main">
                  {syncStats.needsReview}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Need Review
                </Typography>
              </Box>
            )}
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