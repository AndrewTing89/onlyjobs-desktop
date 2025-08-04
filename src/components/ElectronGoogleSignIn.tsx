import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  CircularProgress, 
  Typography,
  Alert,
  Card,
  CardContent
} from '@mui/material';
import { Google } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const accent = "#FF7043";

export default function ElectronGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Listen for auth success
    const handleAuthSuccess = (event: any, data: any) => {
      console.log('Auth success received:', data);
      setLoading(false);
      // Navigate to dashboard or handle success
      navigate('/dashboard');
    };
    
    // Listen for auth error
    const handleAuthError = (event: any, errorMessage: string) => {
      console.error('Auth error received:', errorMessage);
      setLoading(false);
      setError(errorMessage);
    };
    
    // Subscribe to auth events
    window.electronAPI.on('auth-success', handleAuthSuccess);
    window.electronAPI.on('auth-error', handleAuthError);
    
    // Cleanup listeners on unmount
    return () => {
      window.electronAPI.removeListener('auth-success', handleAuthSuccess);
      window.electronAPI.removeListener('auth-error', handleAuthError);
    };
  }, [navigate]);
  
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Use the native Electron OAuth flow with AppAuth-JS
      console.log('Starting native OAuth flow...');
      const result = await window.electronAPI.auth.signIn();
      
      if (result.success) {
        // OAuth flow initiated, wait for auth events
        console.log('OAuth flow started successfully');
      }
      
    } catch (error: any) {
      console.error('OAuth error:', error);
      setError(error.message || 'Failed to start authentication');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', borderRadius: 3, boxShadow: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h5" align="center" gutterBottom sx={{ color: accent, fontWeight: 600 }}>
          Sign in with Google
        </Typography>
        
        <Typography variant="body2" align="center" sx={{ mb: 4, color: '#666' }}>
          We'll open your browser for secure Google sign-in
        </Typography>
        
        {error && (
          <Alert 
            severity={error.includes('complete sign-in') ? 'info' : 'error'} 
            sx={{ mb: 3 }}
          >
            {error}
          </Alert>
        )}
        
        <Button
          fullWidth
          variant="outlined"
          size="large"
          onClick={handleGoogleSignIn}
          disabled={loading}
          startIcon={<Google />}
          sx={{
            borderColor: '#ddd',
            color: '#202020',
            borderRadius: 2,
            py: 1.5,
            textTransform: 'none',
            fontSize: 16,
            '&:hover': {
              borderColor: accent,
              background: `${accent}05`
            }
          }}
        >
          {loading ? <CircularProgress size={24} /> : '[NATIVE ELECTRON] Continue with Google'}
        </Button>
        
        <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #eee' }}>
          <Typography variant="body2" align="center" color="text.secondary">
            After signing in on the web, use the same credentials in the desktop app
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}