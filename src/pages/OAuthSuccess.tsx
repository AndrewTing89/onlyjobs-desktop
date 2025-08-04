import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function OAuthSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // Automatically redirect to settings after 2 seconds
    const timer = setTimeout(() => {
      navigate('/settings?success=gmail-connected');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

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
      <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
        Gmail Connected Successfully!
      </Typography>
      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', mb: 2 }}>
        Your Gmail account has been connected and tokens have been saved.
      </Typography>
      <CircularProgress size={24} sx={{ color: '#FF7043' }} />
      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', mt: 1 }}>
        Redirecting you back to settings...
      </Typography>
    </Box>
  );
}