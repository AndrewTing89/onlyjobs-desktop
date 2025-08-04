import React, { useEffect, useState } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { useSearchParams } from 'react-router-dom';

const ElectronOAuthSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Completing OAuth process...');

  useEffect(() => {
    const handleOAuthSuccess = async () => {
      try {
        const isElectronFlow = searchParams.get('electron') === 'true';
        
        if (isElectronFlow) {
          setMessage('OAuth completed successfully! Please return to the OnlyJobs desktop app and sign in with the same Google account credentials.');
          setStatus('success');
          
          // Try to communicate back to Electron app if possible
          if (window.opener) {
            try {
              window.opener.postMessage({ 
                type: 'OAUTH_SUCCESS',
                source: 'onlyjobs-oauth'
              }, '*');
            } catch (error) {
              console.log('Could not communicate with opener window:', error);
            }
          }
          
          // Auto-close window after delay
          setTimeout(() => {
            window.close();
          }, 5000);
        } else {
          setMessage('OAuth completed, but this does not appear to be an Electron flow.');
          setStatus('error');
        }
      } catch (error) {
        console.error('Error handling OAuth success:', error);
        setMessage('An error occurred while processing OAuth completion.');
        setStatus('error');
      }
    };

    handleOAuthSuccess();
  }, [searchParams]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
        bgcolor: '#f5f5f5',
      }}
    >
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
          <span role="img" aria-label="briefcase" style={{ fontSize: 32 }}>💼</span>
          <Typography variant="h4" sx={{ color: '#FF7043', fontWeight: 700 }}>
            OnlyJobs
          </Typography>
        </Box>
      </Box>

      {status === 'processing' && (
        <>
          <CircularProgress size={48} sx={{ color: '#FF7043', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
            Processing OAuth...
          </Typography>
        </>
      )}

      {status === 'success' && (
        <>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: '#4caf50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h4" sx={{ color: 'white' }}>
              ✓
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ mb: 2, textAlign: 'center', color: '#4caf50' }}>
            OAuth Completed Successfully!
          </Typography>
        </>
      )}

      {status === 'error' && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 500 }}>
          Error processing OAuth completion
        </Alert>
      )}

      <Typography 
        variant="body1" 
        sx={{ 
          color: '#666', 
          textAlign: 'center',
          maxWidth: 600,
          lineHeight: 1.6
        }}
      >
        {message}
      </Typography>

      {status === 'success' && (
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#999', 
            textAlign: 'center',
            mt: 2,
            fontStyle: 'italic'
          }}
        >
          This window will close automatically in 5 seconds...
        </Typography>
      )}
    </Box>
  );
};

export default ElectronOAuthSuccess;