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
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Email as EmailIcon,
  Analytics as AnalyticsIcon,
  ArrowForward as ArrowForwardIcon,
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
    label: 'Fetch Emails',
    description: 'Connect Gmail accounts and fetch emails for processing',
    active: true
  },
  {
    label: 'Review Classifications',
    description: 'Review AI classifications and mark job-related emails',
    active: false
  },
  {
    label: 'Extract Job Details',
    description: 'Use LLM models to parse job details from confirmed job emails',
    active: false
  }
];

interface SyncStats {
  processed?: number;
  found?: number;
  skipped?: number;
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

  const showSnackbar = (message: string, severity: typeof snackbar.severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
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
              title="Step 1 of 3: Fetch Emails"
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
                Connect Gmail accounts and sync job-related emails for classification and parsing.
                This is the first step in the Human-in-the-Loop workflow.
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
                          Ready to proceed?
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {syncStats.processed && syncStats.processed > 0
                            ? `${syncStats.processed} emails fetched and ready for classification review`
                            : "Once you've fetched emails, proceed to review classifications"}
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