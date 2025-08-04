import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Typography, CircularProgress, Alert, Box } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle } from '@mui/icons-material';

// This page acts as a bridge between web OAuth and Electron
const ElectronBridge: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleBridge = async () => {
      // Check if this is for Electron
      const isForElectron = searchParams.get('electron') === 'true';
      
      if (!isForElectron) {
        navigate('/dashboard');
        return;
      }

      if (!currentUser) {
        setStatus('error');
        setMessage('No user signed in. Please complete Google sign-in first.');
        return;
      }

      try {
        // Get the current user's ID token
        const idToken = await currentUser.getIdToken();
        
        // Create a temporary auth code
        const authCode = btoa(JSON.stringify({
          uid: currentUser.uid,
          email: currentUser.email,
          token: idToken,
          timestamp: Date.now()
        }));

        // Store in sessionStorage for the Electron app to retrieve
        sessionStorage.setItem('electron_auth_code', authCode);
        
        setStatus('success');
        setMessage('Authentication successful! You can now return to the desktop app.');
        
        // Try to redirect to custom protocol
        setTimeout(() => {
          window.location.href = `onlyjobs://auth-success?code=${authCode}`;
        }, 2000);
        
      } catch (error) {
        console.error('Bridge error:', error);
        setStatus('error');
        setMessage('Failed to prepare authentication. Please try again.');
      }
    };

    handleBridge();
  }, [currentUser, navigate, searchParams]);

  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h4" gutterBottom>
        💼 OnlyJobs Desktop
      </Typography>

      {status === 'checking' && (
        <Box>
          <CircularProgress size={48} sx={{ mb: 3 }} />
          <Typography variant="h6" gutterBottom>
            Preparing authentication...
          </Typography>
        </Box>
      )}

      {status === 'success' && (
        <Box>
          <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="h6">{message}</Typography>
          </Alert>
          <Typography variant="body1" color="text.secondary">
            If the desktop app doesn't open automatically, you can close this window and return to the desktop app.
          </Typography>
        </Box>
      )}

      {status === 'error' && (
        <Alert severity="error">
          <Typography variant="h6">{message}</Typography>
        </Alert>
      )}
    </Container>
  );
};

export default ElectronBridge;