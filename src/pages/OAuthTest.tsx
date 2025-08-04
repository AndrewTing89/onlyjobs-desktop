import React, { useState } from 'react';
import { Box, Button, Typography, Alert, Paper, TextField } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { gmailService } from '../services/gmail.service';

export default function OAuthTest() {
  const { currentUser } = useAuth();
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState('');

  const testAuthUrl = async () => {
    if (!currentUser) {
      setError('Please log in first');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');
    
    try {
      console.log('🔄 Testing OAuth URL generation...');
      console.log('Current user:', currentUser.email);
      
      const url = await gmailService.getOAuthUrl();
      setAuthUrl(url);
      setResponse('OAuth URL generated successfully');
      console.log('✅ OAuth URL:', url);
      
    } catch (err) {
      console.error('❌ Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to get OAuth URL';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const testOAuth = () => {
    if (authUrl) {
      console.log('🔄 Starting OAuth flow...');
      window.location.href = authUrl;
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        OAuth Test Page
      </Typography>
      
      {!currentUser ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Please log in first to test OAuth. Go to <a href="/login">/login</a>
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          Logged in as: {currentUser.email}
        </Alert>
      )}
      
      <Button 
        variant="contained" 
        onClick={testAuthUrl}
        disabled={loading || !currentUser}
        sx={{ mb: 3, mr: 2 }}
      >
        {loading ? 'Getting OAuth URL...' : 'Test OAuth URL Generation'}
      </Button>
      
      {authUrl && (
        <Button 
          variant="outlined" 
          onClick={testOAuth}
          sx={{ mb: 3 }}
        >
          Start OAuth Flow
        </Button>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {response && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {response}
        </Alert>
      )}
      
      {authUrl && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Generated OAuth URL:
          </Typography>
          <TextField
            value={authUrl}
            multiline
            rows={6}
            fullWidth
            variant="outlined"
            sx={{ mb: 2, fontFamily: 'monospace', fontSize: '12px' }}
          />
          <Typography variant="body2" sx={{ color: '#666' }}>
            This URL should redirect to Google OAuth, then to the backend, then back to /callback
          </Typography>
        </Paper>
      )}
    </Box>
  );
}