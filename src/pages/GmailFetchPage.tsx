import React, { useState, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Stack,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Email as EmailIcon,
  Analytics as AnalyticsIcon,
  ArrowForward as ArrowForwardIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  AccessTime as AccessTimeIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import existing components
import { GmailMultiAccount } from '../components/GmailMultiAccount';

// Import auth context
import { useAuth } from '../contexts/ElectronAuthContext';

const workflowSteps = [
  {
    label: 'Step 1: Fetch & ML Classify',
    description: 'Fetch from Gmail → Filter digests → ML classification',
    active: true
  },
  {
    label: 'Step 2: Review Classifications',
    description: 'Human review of ML classifications',
    active: false
  },
  {
    label: 'Step 3: LLM Extract',
    description: 'LLM extraction for approved emails',
    active: false
  }
];

interface SyncStats {
  processed?: number;
  found?: number;
  skipped?: number;
  needsReview?: number;
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

export default function GmailFetchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const authData = useAuth() as any;
  const currentUser = authData.currentUser;

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'warning' | 'info',
  });
  const [syncStats, setSyncStats] = useState<SyncStats>({});
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);

  const showSnackbar = (message: string, severity: typeof snackbar.severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  useEffect(() => {
    // Listen for sync progress
    if (window.electronAPI) {
      window.electronAPI.on('sync-progress', (progress: SyncProgress) => {
        setSyncProgress(progress);
      });

      window.electronAPI.on('sync-complete', (result: any) => {
        setSyncing(false);
        setSyncProgress(null);
        setSyncStats({
          processed: result.emailsFetched || 0,
          found: result.jobsFound || 0,
          skipped: result.emailsSkipped || 0,
        });
        const message = `Sync complete! Processed ${result.emailsFetched || 0} emails • Found ${result.jobsFound || 0} job applications`;
        showSnackbar(message, 'success');
        // Reload sync history after successful sync
        loadSyncHistory();
      });

      window.electronAPI.on('sync-error', (error: any) => {
        setSyncing(false);
        setSyncProgress(null);
        showSnackbar(`Sync error: ${error.message}`, 'error');
      });

      return () => {
        window.electronAPI.removeAllListeners('sync-progress');
        window.electronAPI.removeAllListeners('sync-complete');
        window.electronAPI.removeAllListeners('sync-error');
      };
    }
  }, []);

  // Load sync history on mount and after syncs
  useEffect(() => {
    loadSyncHistory();
  }, []);

  const loadSyncHistory = async () => {
    console.log('Loading sync history...');
    console.log('window.electronAPI:', window.electronAPI);
    console.log('window.electronAPI.gmail:', window.electronAPI?.gmail);
    
    if (window.electronAPI?.gmail?.getSyncHistory) {
      try {
        console.log('Calling getSyncHistory...');
        const result = await window.electronAPI.gmail.getSyncHistory(10);
        console.log('Sync history result:', result);
        
        if (result.success && result.history) {
          console.log('Setting sync history:', result.history);
          setSyncHistory(result.history);
        } else {
          console.log('No history in result or not successful');
        }
      } catch (error) {
        console.error('Failed to load sync history:', error);
      }
    } else {
      console.log('getSyncHistory API not available');
    }
  };

  const handleNavigateToClassification = () => {
    navigate('/classification-review');
  };

  const handleLogout = async () => {
    try {
      await authData.signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <CssBaseline />

        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar
              currentUser={currentUser}
              onLogout={handleLogout}
              title="Step 1 of 3: Fetch & ML Classify"
            />
          </Box>

          {/* Workflow Progress */}
          <Box sx={{ px: 3, py: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EmailIcon color="primary" />
                  Workflow
                </Typography>
                <Stepper activeStep={0} orientation="horizontal">
                  {workflowSteps.map((step, index) => (
                    <Step 
                      key={step.label} 
                      completed={index === 0 && (syncStats.processed !== undefined && syncStats.processed > 0)}
                      sx={{
                        '& .MuiStepLabel-root': {
                          ...(index === 0 && {
                            padding: '8px',
                            border: '2px solid #FF7043',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255, 112, 67, 0.04)'
                          })
                        }
                      }}
                    >
                      <StepLabel>
                        <Box>
                          <Typography variant="subtitle2">{step.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {step.description}
                          </Typography>
                        </Box>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>
          </Box>

          {/* Main Content */}
          <Box
            sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}
            className="page-enter gpu-accelerated"
          >
            {/* Page Header */}
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 2,
                  fontWeight: 600,
                  color: onlyJobsTheme.palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <EmailIcon sx={{ fontSize: '2rem' }} />
                Gmail Email Fetching
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Connect Gmail accounts and sync emails. Automatically filters digests and uses ML classification (no LLM).
                Classification happens locally in 1-2ms per email. Next step: Human review before LLM extraction.
              </Typography>
            </Box>

            <Grid container spacing={3}>
              {/* Gmail Accounts Section */}
              <Grid size={{ xs: 12 }}>
                <Card sx={{ mb: 3 }}>
                  <CardContent sx={{ p: 3 }}>
                    <GmailMultiAccount />
                  </CardContent>
                </Card>

                {/* Next Step Card */}
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="h6" gutterBottom>
                          ML Classification Complete
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {syncStats.processed && syncStats.processed > 0
                            ? `${syncStats.processed} emails classified. ${syncStats.needsReview || 0} need human review.`
                            : "Once you've fetched emails, proceed to review ML classifications"}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        size="large"
                        endIcon={<ArrowForwardIcon />}
                        onClick={handleNavigateToClassification}
                        disabled={!syncStats.processed || syncStats.processed === 0}
                        sx={{ 
                          py: 1.5,
                          px: 3,
                          fontSize: '1rem',
                          fontWeight: 600,
                          minWidth: 200
                        }}
                      >
                        Review Classifications
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
                {/* Sync Progress */}
                {syncing && syncProgress && (
                  <Card sx={{ mb: 3 }}>
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Sync Progress
                      </Typography>

                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {syncProgress.status}
                      </Typography>

                      {syncProgress.details && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                          {syncProgress.details}
                        </Typography>
                      )}

                      {/* Account progress */}
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

                      {/* Email progress */}
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
                    </CardContent>
                  </Card>
                )}

                {/* Sync Results */}
                {syncStats.processed !== undefined && !syncing && (
                  <Card>
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Last Sync Results
                      </Typography>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            Emails Processed:
                          </Typography>
                          <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600 }}>
                            {syncStats.processed || 0}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            Job Applications Found:
                          </Typography>
                          <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                            {syncStats.found || 0}
                          </Typography>
                        </Box>
                        {syncStats.skipped && syncStats.skipped > 0 && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">
                              Already Processed:
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                              {syncStats.skipped}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                )}

                {/* Sync History */}
                <Card sx={{ mt: 3 }}>
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HistoryIcon />
                        Sync History
                      </Typography>
                      {syncHistory.length > 0 ? (
                        <>
                          <TableContainer component={Paper} elevation={0}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Sync Date</TableCell>
                              <TableCell align="center">Start Date</TableCell>
                              <TableCell align="center">End Date</TableCell>
                              <TableCell align="center">Days</TableCell>
                              <TableCell align="center">Accounts</TableCell>
                              <TableCell align="center">Fetched</TableCell>
                              <TableCell align="center">Jobs Found</TableCell>
                              <TableCell align="center">Duration</TableCell>
                              <TableCell align="center">Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {syncHistory.slice(0, 5).map((sync) => (
                              <TableRow key={sync.id}>
                                {/* Sync Date */}
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                    <Typography variant="body2">
                                      {new Date(sync.sync_date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                
                                {/* Start Date */}
                                <TableCell align="center">
                                  <Typography variant="body2">
                                    {sync.date_from ? new Date(sync.date_from).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    }) : '—'}
                                  </Typography>
                                </TableCell>
                                
                                {/* End Date */}
                                <TableCell align="center">
                                  <Typography variant="body2">
                                    {sync.date_to ? new Date(sync.date_to).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    }) : '—'}
                                  </Typography>
                                </TableCell>
                                
                                {/* Days (calculated) */}
                                <TableCell align="center">
                                  <Typography variant="body2">
                                    {sync.date_from && sync.date_to 
                                      ? Math.ceil((new Date(sync.date_to).getTime() - new Date(sync.date_from).getTime()) / (1000 * 60 * 60 * 24))
                                      : sync.days_synced || '—'}
                                  </Typography>
                                </TableCell>
                                
                                {/* Accounts */}
                                <TableCell align="center">
                                  <Typography variant="body2">{sync.accounts_synced}</Typography>
                                </TableCell>
                                
                                {/* Fetched */}
                                <TableCell align="center">
                                  <Typography variant="body2">{sync.emails_fetched}</Typography>
                                </TableCell>
                                {/* Jobs Found */}
                                <TableCell align="center">
                                  <Chip 
                                    label={sync.jobs_found} 
                                    size="small" 
                                    color={sync.jobs_found > 0 ? 'success' : 'default'}
                                    variant={sync.jobs_found > 0 ? 'filled' : 'outlined'}
                                  />
                                </TableCell>
                                
                                {/* Duration */}
                                <TableCell align="center">
                                  <Typography variant="body2">
                                    {(sync.duration_ms / 1000).toFixed(1)}s
                                  </Typography>
                                </TableCell>
                                
                                {/* Status */}
                                <TableCell align="center">
                                  {sync.status === 'success' || sync.status === 'completed' ? (
                                    <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
                                  ) : (
                                    <ErrorIcon sx={{ fontSize: 20, color: 'error.main' }} />
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                          </TableContainer>
                          {syncHistory.length > 5 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Showing latest 5 of {syncHistory.length} syncs
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Box sx={{ py: 3, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            No sync history available yet. Sync your emails to see history here.
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
              </Grid>
            </Grid>

          </Box>
        </Box>

        {/* Snackbar for feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}