import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress
} from '@mui/material';
import {
  Email,
  CheckCircle,
  Error,
  Refresh,
  Link,
  LinkOff,
  Delete
} from '@mui/icons-material';

const accent = "#FF7043";

interface EmailPreview {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export default function GmailConnectionElectron() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<EmailPreview[]>([]);
  const [fetchingEmails, setFetchingEmails] = useState(false);
  const [showEmailsDialog, setShowEmailsDialog] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    checkGmailStatus();
  }, []);

  const checkGmailStatus = async () => {
    try {
      setChecking(true);
      const result = await window.electronAPI.gmail.getAuthStatus();
      console.log('Gmail auth status:', result);
      setIsConnected(result.authenticated);
    } catch (error) {
      console.error('Error checking Gmail status:', error);
      setIsConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Connecting to Gmail...');
      const result = await window.electronAPI.gmail.authenticate();
      
      if (result.success) {
        setIsConnected(true);
        // Optionally fetch a few emails to test
        await fetchTestEmails();
      }
    } catch (error: any) {
      console.error('Gmail connection error:', error);
      
      // More specific error handling
      if (error.message?.includes('No handler registered')) {
        setError('Gmail authentication is not properly configured. Please check the OAuth settings.');
      } else if (error.message?.includes('gmail:authenticate')) {
        setError('Gmail authentication handler error. The redirect URI may need to be added to Google Cloud Console.');
      } else {
        setError(error.message || 'Failed to connect to Gmail');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await window.electronAPI.gmail.disconnect();
      setIsConnected(false);
      setEmails([]);
    } catch (error: any) {
      console.error('Gmail disconnect error:', error);
      setError(error.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestEmails = async () => {
    try {
      setFetchingEmails(true);
      setSyncStatus('Fetching recent job-related emails (max 20)...');
      
      // Fetch recent emails with job-related keywords
      const result = await window.electronAPI.gmail.fetchEmails({
        maxResults: 20,
        query: 'subject:(job OR position OR opportunity OR interview OR application OR offer OR hiring) newer_than:30d'
      });
      
      if (result.success && result.messages) {
        console.log(`Fetched ${result.messages.length} emails`);
        
        // Process emails for preview
        const previews = result.messages.map((msg: any) => {
          const headers = msg.payload?.headers || [];
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No subject';
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown sender';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          
          return {
            id: msg.id,
            subject,
            from,
            date: new Date(date).toLocaleDateString(),
            snippet: msg.snippet || ''
          };
        });
        
        setEmails(previews);
        setSyncStatus(`Found ${previews.length} potential job-related emails`);
      }
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      setError('Failed to fetch emails');
    } finally {
      setFetchingEmails(false);
    }
  };

  const handleFullSync = async () => {
    try {
      setSyncProgress(0);
      setSyncStatus('Starting email sync...');
      setFetchingEmails(true);
      
      let currentPhase = 'fetching';
      let jobsFound = 0;
      
      // Listen for progress updates
      const handleFetchProgress = (data: any) => {
        setSyncProgress((data.current / data.total) * 50); // First 50% for fetching
        setSyncStatus(data.status);
      };
      
      const handleFetchComplete = (data: any) => {
        setSyncStatus(`Fetched ${data.fetched} emails, ${data.stored} new. Analyzing...`);
        currentPhase = 'classifying';
      };
      
      const handleClassifyProgress = (data: any) => {
        setSyncProgress(50 + (data.current / data.total) * 50); // Last 50% for classifying
        setSyncStatus(data.status);
      };
      
      const handleClassifyComplete = (data: any) => {
        jobsFound += data.jobsFound;
      };
      
      const handleError = (error: string) => {
        setError(`${currentPhase} failed: ${error}`);
        setFetchingEmails(false);
      };
      
      const handleJobFound = (job: any) => {
        console.log('New job found:', job);
      };
      
      // Register event listeners
      window.electronAPI.on('fetch-progress', handleFetchProgress);
      window.electronAPI.on('fetch-complete', handleFetchComplete);
      window.electronAPI.on('classify-progress', handleClassifyProgress);
      window.electronAPI.on('classify-complete', handleClassifyComplete);
      window.electronAPI.on('fetch-error', handleError);
      window.electronAPI.on('classify-error', handleError);
      window.electronAPI.on('job-found', handleJobFound);
      
      // Start sync (which now does both fetch and classify)
      const result = await window.electronAPI.gmail.sync({
        daysToSync: 90,
        maxEmails: 500
      });
      
      setSyncStatus(`Sync complete! Processed ${result.emailsProcessed} emails, found ${result.jobsFound || jobsFound} jobs`);
      setSyncProgress(100);
      setFetchingEmails(false);
      
      // Clean up listeners
      window.electronAPI.removeListener('fetch-progress', handleFetchProgress);
      window.electronAPI.removeListener('fetch-complete', handleFetchComplete);
      window.electronAPI.removeListener('classify-progress', handleClassifyProgress);
      window.electronAPI.removeListener('classify-complete', handleClassifyComplete);
      window.electronAPI.removeListener('fetch-error', handleError);
      window.electronAPI.removeListener('classify-error', handleError);
      window.electronAPI.removeListener('job-found', handleJobFound);
      
    } catch (error: any) {
      console.error('Sync error:', error);
      setError('Failed to start sync: ' + error.message);
      setFetchingEmails(false);
    }
  };

  if (checking) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Email sx={{ color: accent, fontSize: 32 }} />
              <Typography variant="h6">Gmail Connection</Typography>
            </Box>
            <Chip
              icon={isConnected ? <CheckCircle /> : <Error />}
              label={isConnected ? 'Connected' : 'Not Connected'}
              color={isConnected ? 'success' : 'default'}
              variant={isConnected ? 'filled' : 'outlined'}
            />
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {!isConnected ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Connect your Gmail account to automatically import and track job applications from your emails.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Link />}
                onClick={handleConnect}
                disabled={loading}
                sx={{
                  background: accent,
                  '&:hover': { background: accent }
                }}
              >
                {loading ? <CircularProgress size={24} /> : 'Connect Gmail'}
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Your Gmail is connected. OnlyJobs can now sync your job-related emails.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={fetchTestEmails}
                  disabled={fetchingEmails}
                  title="Fetch job-related emails from the last 30 days (max 20)"
                >
                  Test Fetch (30 days)
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<Email />}
                  onClick={() => setShowEmailsDialog(true)}
                  disabled={emails.length === 0}
                >
                  View Emails ({emails.length})
                </Button>
                
                <Button
                  variant="contained"
                  onClick={handleFullSync}
                  disabled={fetchingEmails}
                  title="Sync all emails from the last 90 days (max 200 for testing)"
                  sx={{
                    background: accent,
                    '&:hover': { background: accent }
                  }}
                >
                  Sync (90 days)
                </Button>
                
                <Button
                  variant="text"
                  startIcon={<LinkOff />}
                  onClick={handleDisconnect}
                  disabled={loading}
                  color="error"
                >
                  Disconnect
                </Button>
              </Box>
              
              {fetchingEmails && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {syncStatus}
                  </Typography>
                  <LinearProgress variant="determinate" value={syncProgress} />
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Email Preview Dialog */}
      <Dialog
        open={showEmailsDialog}
        onClose={() => setShowEmailsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Recent Job-Related Emails
          <Typography variant="body2" color="text.secondary">
            These emails may contain job opportunities
          </Typography>
        </DialogTitle>
        <DialogContent>
          <List>
            {emails.map((email) => (
              <ListItem key={email.id} divider>
                <ListItemText
                  primary={email.subject}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        {email.from}
                      </Typography>
                      {' — '}
                      {email.snippet.substring(0, 100)}...
                      <br />
                      <Typography component="span" variant="caption" color="text.secondary">
                        {email.date}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEmailsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}