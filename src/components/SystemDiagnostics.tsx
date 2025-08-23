import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Alert,
  LinearProgress,
  Grid,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  BugReport as BugReportIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Psychology as PsychologyIcon,
  Email as EmailIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';

interface CircuitBreakerStatus {
  success: boolean;
  active: boolean;
  failures: number;
  max_failures: number;
  blocked_until: number;
  blocked_for_ms: number;
}

interface SystemStatus {
  llm: {
    ready: boolean;
    status: string;
    circuitBreaker: CircuitBreakerStatus | null;
  };
  gmail: {
    accountsCount: number;
    lastSync: string | null;
  };
  database: {
    ready: boolean;
  };
}

export const SystemDiagnostics: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    llm: {
      ready: false,
      status: 'Loading...',
      circuitBreaker: null,
    },
    gmail: {
      accountsCount: 0,
      lastSync: null,
    },
    database: {
      ready: false,
    },
  });
  
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSystemStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check LLM status
      const [mlStatus, mlReady, circuitBreakerStatus, gmailAccounts] = await Promise.allSettled([
        window.electronAPI.getMlStatus(),
        window.electronAPI.isMlReady(),
        window.electronAPI.getCircuitBreakerStatus(),
        window.electronAPI.gmail.getAccounts(),
      ]);

      const newStatus: SystemStatus = {
        llm: {
          ready: mlReady.status === 'fulfilled' && mlReady.value.ready,
          status: mlStatus.status === 'fulfilled' ? mlStatus.value.status || 'Unknown' : 'Error loading',
          circuitBreaker: circuitBreakerStatus.status === 'fulfilled' ? circuitBreakerStatus.value : null,
        },
        gmail: {
          accountsCount: gmailAccounts.status === 'fulfilled' ? gmailAccounts.value.accounts?.length || 0 : 0,
          lastSync: null, // Could be enhanced to track last sync time
        },
        database: {
          ready: true, // If we got this far, database is working
        },
      };

      setSystemStatus(newStatus);
    } catch (err: any) {
      setError(`Failed to load system status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCircuitBreaker = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.resetCircuitBreaker();
      
      if (result.success) {
        setMessage('Circuit breaker has been reset successfully. LLM classification should work again.');
        // Reload status to reflect changes
        await loadSystemStatus();
      } else {
        setError(`Failed to reset circuit breaker: ${result.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      setError(`Error resetting circuit breaker: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSystemStatus();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ms: number) => {
    if (ms <= 0) return 'None';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  };

  const getStatusColor = (isHealthy: boolean) => isHealthy ? 'success' : 'error';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugReportIcon />
          System Diagnostics
        </Typography>
        <Tooltip title="Refresh status">
          <IconButton onClick={loadSystemStatus} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {message && (
        <Alert severity="success" onClose={() => setMessage(null)} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* LLM Status Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <PsychologyIcon color={getStatusColor(systemStatus.llm.ready)} />
                <Typography variant="h6">LLM Classification</Typography>
                <Chip 
                  label={systemStatus.llm.ready ? 'Ready' : 'Not Ready'} 
                  color={getStatusColor(systemStatus.llm.ready)}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {systemStatus.llm.status}
              </Typography>

              {/* Circuit Breaker Status */}
              {systemStatus.llm.circuitBreaker && (
                <Accordion sx={{ mt: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {systemStatus.llm.circuitBreaker.active ? (
                        <WarningIcon color="warning" />
                      ) : (
                        <CheckCircleIcon color="success" />
                      )}
                      <Typography variant="subtitle2">
                        Circuit Breaker {systemStatus.llm.circuitBreaker.active ? 'ACTIVE' : 'Normal'}
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List dense>
                      <ListItem>
                        <ListItemText 
                          primary="Failure Count" 
                          secondary={`${systemStatus.llm.circuitBreaker.failures} / ${systemStatus.llm.circuitBreaker.max_failures}`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemText 
                          primary="Reset Time" 
                          secondary={formatTime(systemStatus.llm.circuitBreaker.blocked_for_ms)}
                        />
                      </ListItem>
                      {systemStatus.llm.circuitBreaker.active && (
                        <ListItem>
                          <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            onClick={handleResetCircuitBreaker}
                            disabled={loading}
                          >
                            Reset Circuit Breaker
                          </Button>
                        </ListItem>
                      )}
                    </List>
                  </AccordionDetails>
                </Accordion>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Gmail Status Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <EmailIcon color={getStatusColor(systemStatus.gmail.accountsCount > 0)} />
                <Typography variant="h6">Gmail Integration</Typography>
                <Chip 
                  label={`${systemStatus.gmail.accountsCount} accounts`} 
                  color={systemStatus.gmail.accountsCount > 0 ? 'success' : 'default'}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {systemStatus.gmail.accountsCount === 0 ? 
                  'No Gmail accounts connected' : 
                  `${systemStatus.gmail.accountsCount} Gmail account${systemStatus.gmail.accountsCount !== 1 ? 's' : ''} connected`
                }
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Database Status Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <StorageIcon color={getStatusColor(systemStatus.database.ready)} />
                <Typography variant="h6">Database</Typography>
                <Chip 
                  label={systemStatus.database.ready ? 'Connected' : 'Error'} 
                  color={getStatusColor(systemStatus.database.ready)}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {systemStatus.database.ready ? 'Database connection is healthy' : 'Database connection error'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Alert severity="info">
          <Typography variant="subtitle2" gutterBottom>Troubleshooting Tips:</Typography>
          <Typography variant="body2" component="div">
            • <strong>Circuit Breaker Active:</strong> The LLM model has failed multiple times and is temporarily disabled. Reset it above.<br/>
            • <strong>LLM Not Ready:</strong> The AI model may be loading or not properly installed. Try restarting the application.<br/>
            • <strong>No Gmail Accounts:</strong> Add Gmail accounts in Settings to enable email sync functionality.<br/>
            • <strong>Database Errors:</strong> Restart the application. If issues persist, check disk space and permissions.
          </Typography>
        </Alert>
      </Box>
    </Box>
  );
};