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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Sync as SyncIcon,
  Email as EmailIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

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
}

export const GmailMultiAccount: React.FC = () => {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [emailFetchLimit, setEmailFetchLimit] = useState<number>(50);

  useEffect(() => {
    loadAccounts();
    
    // Listen for sync progress
    window.electronAPI.on('sync-progress', (progress: SyncProgress) => {
      setSyncProgress(progress);
    });
    
    window.electronAPI.on('sync-complete', (result: any) => {
      setSyncing(false);
      setSyncProgress(null);
      setSuccessMessage(
        `Sync complete! Fetched ${result.emailsFetched} emails, classified ${result.emailsClassified}, found ${result.jobsFound} jobs from ${result.accounts} accounts.`
      );
      loadAccounts(); // Refresh accounts to show updated sync times
    });
    
    window.electronAPI.on('sync-error', (error: any) => {
      setSyncing(false);
      setSyncProgress(null);
      setError(`Sync error: ${error.message}`);
    });
    
    return () => {
      window.electronAPI.removeAllListeners('sync-progress');
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
    
    try {
      await window.electronAPI.gmail.syncAll({
        daysToSync: 90,
        maxEmails: emailFetchLimit
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
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EmailIcon />
        Gmail Accounts
      </Typography>
      
      <Typography variant="body2" color="text.secondary" paragraph>
        Connect multiple Gmail accounts to sync job applications from all your email addresses.
      </Typography>

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

      {/* Settings Accordion */}
      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon />
            <Typography variant="h6">Sync Settings</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Emails to fetch per sync"
              type="number"
              value={emailFetchLimit}
              onChange={(e) => setEmailFetchLimit(Math.max(1, parseInt(e.target.value) || 1))}
              inputProps={{
                min: 1,
                max: 1000,
                step: 1
              }}
              helperText="Number of recent emails to fetch from each account (1-1000)"
              sx={{ maxWidth: 300 }}
            />
            <Typography variant="body2" color="text.secondary">
              Higher numbers will take longer to sync but may find more job applications.
              Default is 50 emails per account.
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddAccount}
          disabled={loading || syncing}
        >
          {loading ? 'Connecting...' : 'Add Gmail Account'}
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={handleSyncAll}
          disabled={syncing || accounts.length === 0}
        >
          Sync All Accounts ({emailFetchLimit} emails each)
        </Button>
      </Box>

      {syncing && syncProgress && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Syncing Emails...
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {syncProgress.status}
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            {syncProgress.current} / {syncProgress.total}
          </Typography>
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