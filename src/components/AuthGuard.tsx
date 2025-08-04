import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, getAuthToken } from '../utils/authToken';
import { Box, CircularProgress, Typography, Button } from '@mui/material';

const accent = "#FF7043";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    checkAuth();
    
    // Listen for OAuth callbacks
    if (window.electronAPI) {
      const handleOAuthCallback = (data: any) => {
        console.log('OAuth callback received:', data);
        if (data.success && data.token) {
          // Verify state matches
          const savedState = sessionStorage.getItem('oauth_state');
          console.log('Saved state:', savedState, 'Received state:', data.state);
          
          if (!savedState || savedState === data.state) {
            // Save token
            import('../utils/authToken').then(({ saveAuthToken }) => {
              saveAuthToken(data.token);
              console.log('Token saved, reloading...');
              // Reload to update auth state
              window.location.reload();
            });
          } else {
            console.error('State mismatch in OAuth callback');
          }
        }
      };
      
      window.electronAPI.onOAuthCallback(handleOAuthCallback);
      
      // Cleanup
      return () => {
        if (window.electronAPI?.removeAllListeners) {
          window.electronAPI.removeAllListeners('oauth-callback');
        }
      };
    }
  }, []);
  
  const checkAuth = () => {
    const auth = isAuthenticated();
    setAuthenticated(auth);
    setChecking(false);
    
    if (!auth && window.electronAPI) {
      // No token, initiate OAuth flow
      initiateOAuth();
    }
  };
  
  const initiateOAuth = async () => {
    // Generate a random state for security
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem('oauth_state', state);
    
    // Open browser for authentication
    const authUrl = `https://onlyjobs-465420.web.app/electron-auth?state=${state}`;
    
    if (window.electronAPI) {
      await window.electronAPI.openExternal(authUrl);
    }
  };
  
  if (checking) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress sx={{ color: accent }} />
        <Typography sx={{ mt: 2 }}>Checking authentication...</Typography>
      </Box>
    );
  }
  
  if (!authenticated) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        p: 4
      }}>
        <Typography variant="h5" gutterBottom>
          Authentication Required
        </Typography>
        <Typography sx={{ mb: 3, textAlign: 'center' }}>
          Please complete authentication in your browser to continue.
        </Typography>
        <Button 
          variant="contained"
          onClick={initiateOAuth}
          sx={{ 
            background: accent,
            '&:hover': { background: accent }
          }}
        >
          Open Browser to Sign In
        </Button>
      </Box>
    );
  }
  
  return <>{children}</>;
}