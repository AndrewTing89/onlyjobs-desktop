import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, Button } from '@mui/material';

const accent = "#FF7043";

interface AppAuthGuardProps {
  children: React.ReactNode;
}

export default function AppAuthGuard({ children }: AppAuthGuardProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  
  console.log('AppAuthGuard render:', { 
    checking, 
    authenticated, 
    loading,
    hasElectronAPI: !!window.electronAPI 
  });
  
  useEffect(() => {
    checkAuth();
    
    // Listen for auth events
    if (window.electronAPI) {
      window.electronAPI.onAuthSuccess((data: any) => {
        console.log('AppAuthGuard: Auth success received:', data);
        setAuthenticated(true);
        setChecking(false);
        setLoading(false);
      });
      
      window.electronAPI.onAuthError((error: string) => {
        console.error('AppAuthGuard: Auth error received:', error);
        setLoading(false);
      });
    }
    
    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('auth-success');
        window.electronAPI.removeAllListeners('auth-error');
      }
    };
  }, []);
  
  const checkAuth = async () => {
    if (!window.electronAPI) {
      setChecking(false);
      setAuthenticated(true);
      return;
    }
    
    try {
      const result = await window.electronAPI.auth.isAuthenticated();
      console.log('AppAuthGuard: Auth check result:', result);
      setAuthenticated(result.success && result.authenticated);
    } catch (error) {
      console.error('AppAuthGuard: Auth check error:', error);
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  };
  
  const handleSignIn = async () => {
    console.log('AppAuthGuard: Starting sign in...');
    setLoading(true);
    try {
      const result = await window.electronAPI.auth.signIn();
      console.log('AppAuthGuard: Sign in initiated:', result);
      // The auth-success event will handle the rest
    } catch (error) {
      console.error('AppAuthGuard: Sign in error:', error);
      setLoading(false);
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
        <Typography variant="h4" gutterBottom sx={{ color: accent, fontWeight: 600 }}>
          Welcome to OnlyJobs Desktop
        </Typography>
        <Typography sx={{ mb: 4, textAlign: 'center' }}>
          Sign in with your Google account to get started
        </Typography>
        <Button 
          variant="contained"
          onClick={handleSignIn}
          disabled={loading}
          size="large"
          sx={{ 
            background: accent,
            px: 4,
            py: 1.5,
            '&:hover': { background: accent }
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : '[ELECTRON] Sign in with Google'}
        </Button>
      </Box>
    );
  }
  
  return <>{children}</>;
}