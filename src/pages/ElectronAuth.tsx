import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  CircularProgress,
  Alert,
  Card,
  CardContent
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';

const accent = "#FF7043";

export default function ElectronAuth() {
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const state = searchParams.get('state');
  
  useEffect(() => {
    if (currentUser && state) {
      // User is authenticated, generate token and redirect
      generateTokenAndRedirect();
    }
  }, [currentUser, state]);
  
  const generateTokenAndRedirect = async () => {
    if (!currentUser || !state) return;
    
    try {
      setLoading(true);
      
      // Get ID token from Firebase
      const idToken = await currentUser.getIdToken();
      
      // Create auth data
      const authData = {
        token: idToken,
        expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour
        user: {
          uid: currentUser.uid,
          email: currentUser.email!,
          displayName: currentUser.displayName || undefined
        }
      };
      
      // Redirect to custom protocol with token
      const redirectUrl = `onlyjobs://auth-success?token=${encodeURIComponent(
        JSON.stringify(authData)
      )}&state=${state}`;
      
      setSuccess(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);
      
    } catch (error: any) {
      console.error('Error generating token:', error);
      setError(error.message || 'Failed to generate authentication token');
      setLoading(false);
    }
  };
  
  const handleSignIn = () => {
    // Redirect to login page with return URL
    window.location.href = `/login?redirect=/electron-auth&state=${state}`;
  };
  
  if (!state) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <Container maxWidth="sm">
          <Alert severity="error">
            Invalid authentication request. Please try again from the desktop app.
          </Alert>
        </Container>
      </Box>
    );
  }
  
  return (
    <Box sx={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center' }}>
      <Container maxWidth="sm">
        <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" align="center" gutterBottom sx={{ color: accent, fontWeight: 700 }}>
              OnlyJobs Desktop
            </Typography>
            
            {success ? (
              <>
                <Alert severity="success" sx={{ mb: 3 }}>
                  <Typography variant="body1" fontWeight="bold">
                    Authentication successful!
                  </Typography>
                  <Typography variant="body2">
                    Redirecting back to desktop app...
                  </Typography>
                </Alert>
                <Box sx={{ textAlign: 'center' }}>
                  <CircularProgress sx={{ color: accent }} />
                </Box>
              </>
            ) : (
              <>
                {currentUser ? (
                  <>
                    <Typography variant="body1" align="center" sx={{ mb: 3 }}>
                      Authorizing as <strong>{currentUser.email}</strong>
                    </Typography>
                    {error && (
                      <Alert severity="error" sx={{ mb: 3 }}>
                        {error}
                      </Alert>
                    )}
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      onClick={generateTokenAndRedirect}
                      disabled={loading}
                      sx={{
                        background: accent,
                        py: 1.5,
                        '&:hover': { background: accent }
                      }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Authorize Desktop App'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Typography variant="body1" align="center" sx={{ mb: 3 }}>
                      Please sign in to authorize the desktop app
                    </Typography>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      onClick={handleSignIn}
                      sx={{
                        background: accent,
                        py: 1.5,
                        '&:hover': { background: accent }
                      }}
                    >
                      Sign In
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}