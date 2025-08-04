import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
} from '@mui/material';
import {
  Mail,
  CheckCircle,
  Security,
  CloudSync,
  Link,
  LinkOff,
} from '@mui/icons-material';
import { useGmailSync } from '../hooks/useGmailSync';
import { SyncNowButton } from './SyncNowButton';

const accent = '#FF7043';
const white = '#fff';
const textColor = '#202020';
const successColor = '#4caf50';

interface GmailConnectionProps {
  isConnected: boolean;
  onConnectionChange: (connected: boolean) => void;
  onGlobalRefresh?: () => Promise<void>;
}


export const GmailConnection: React.FC<GmailConnectionProps> = ({ 
  isConnected: propIsConnected, 
  onConnectionChange,
  onGlobalRefresh
}) => {
  const { 
    isConnecting, 
    error, 
    isConnected: hookIsConnected, 
    isCheckingStatus,
    connectGmail, 
    disconnectGmail, 
    checkConnectionStatus 
  } = useGmailSync();
  const [activeStep, setActiveStep] = useState(0);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Use the hook's connection status, with fallback to prop
  const isConnected = hookIsConnected || propIsConnected;

  // Check connection status when component mounts
  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  const steps = [
    {
      label: 'Authorize Access',
      description: 'Connect your Gmail account securely',
      icon: <Security sx={{ color: accent }} />,
    },
    {
      label: 'Grant Permissions',
      description: 'Allow OnlyJobs to read your emails',
      icon: <Mail sx={{ color: accent }} />,
    },
    {
      label: 'Sync Emails',
      description: 'Process your job application emails',
      icon: <CloudSync sx={{ color: accent }} />,
    },
  ];

  const handleConnect = async () => {
    try {
      setActiveStep(0);
      await connectGmail();
      // Recheck status after connection
      await checkConnectionStatus();
      
      // Refresh global state
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }
      
      onConnectionChange(true);
    } catch (error) {
      console.error('Connection failed:', error);
      // The error will be displayed by the useGmailSync hook
    }
  };


  const handleDisconnect = async () => {
    try {
      await disconnectGmail();
      // Recheck status after disconnection
      await checkConnectionStatus();
      
      // Refresh global state
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }
      
      onConnectionChange(false);
      setActiveStep(0);
    } catch (error) {
      console.error('Disconnection failed:', error);
    }
  };

  const handleSyncComplete = () => {
    setSyncFeedback({ message: 'Emails synced successfully!', type: 'success' });
    setTimeout(() => setSyncFeedback(null), 5000);
  };

  const handleSyncError = (error: string) => {
    setSyncFeedback({ message: `Sync failed: ${error}`, type: 'error' });
    setTimeout(() => setSyncFeedback(null), 5000);
  };

  // Show loading state while checking connection status
  if (isCheckingStatus) {
    return (
      <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={40} sx={{ color: accent, mb: 2 }} />
          <Typography variant="body2" sx={{ color: '#666' }}>
            Checking Gmail connection status...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (isConnected) {
    return (
      <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <CheckCircle sx={{ color: successColor, mr: 2 }} />
            <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
              Gmail Connected
            </Typography>
            <Chip
              label="Active"
              size="small"
              sx={{
                ml: 2,
                bgcolor: `${successColor}20`,
                color: successColor,
                fontWeight: 500,
              }}
            />
          </Box>

          <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
            Your Gmail account is connected and syncing job application emails automatically.
          </Typography>

          {/* Sync progress is now handled by individual sync operations */}

          {syncFeedback && (
            <Alert 
              severity={syncFeedback.type} 
              sx={{ mb: 2, borderRadius: 2 }}
            >
              {syncFeedback.message}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <SyncNowButton 
              onSyncComplete={handleSyncComplete}
              onSyncError={handleSyncError}
            />
            <Button
              variant="outlined"
              onClick={handleDisconnect}
              startIcon={<LinkOff />}
              sx={{
                borderColor: '#d32f2f',
                color: '#d32f2f',
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#d32f2f',
                  backgroundColor: '#ffebee',
                },
              }}
            >
              Disconnect Gmail
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1 }}>
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Mail sx={{ color: accent, mr: 2 }} />
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
            Connect Gmail
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ color: '#666', mb: 4 }}>
          Connect your Gmail account to automatically track job application emails and responses.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {isConnecting && (
          <Box sx={{ mb: 4 }}>
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((step, index) => (
                <Step key={step.label}>
                  <StepLabel
                    icon={
                      activeStep > index ? (
                        <CheckCircle sx={{ color: successColor }} />
                      ) : activeStep === index ? (
                        <CircularProgress size={24} sx={{ color: accent }} />
                      ) : (
                        step.icon
                      )
                    }
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {step.label}
                    </Typography>
                  </StepLabel>
                  <StepContent>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      {step.description}
                    </Typography>
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleConnect}
            disabled={isConnecting}
            startIcon={
              isConnecting ? (
                <CircularProgress size={20} sx={{ color: white }} />
              ) : (
                <Link />
              )
            }
            sx={{
              bgcolor: accent,
              borderRadius: 2,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: accent,
                boxShadow: '0 4px 12px rgba(255, 112, 67, 0.3)',
              },
              '&:disabled': {
                bgcolor: '#ccc',
              },
            }}
          >
            {isConnecting ? 'Connecting...' : 'Connect Gmail Account'}
          </Button>


          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Security sx={{ color: '#666', fontSize: 16 }} />
            <Typography variant="caption" sx={{ color: '#666' }}>
              Your data is encrypted and secure. We only read job-related emails.
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};