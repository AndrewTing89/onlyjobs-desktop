import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Typography, Paper, Button, TextField, Alert, Box } from '@mui/material';
import { ContentCopy, CheckCircle } from '@mui/icons-material';

const GenerateToken: React.FC = () => {
  const { currentUser } = useAuth();
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateToken = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        // Get ID token which can be used for authentication
        const idToken = await currentUser.getIdToken();
        
        // Create a simple auth token with user info
        const authData = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          token: idToken,
          expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        };
        
        // Encode as base64
        const encodedToken = btoa(JSON.stringify(authData));
        setToken(encodedToken);
        setLoading(false);
      } catch (error) {
        console.error('Error generating token:', error);
        setLoading(false);
      }
    };

    generateToken();
  }, [currentUser]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!currentUser) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">
          You must be signed in to generate an authentication token.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Typography variant="h4" gutterBottom>
        Desktop App Authentication
      </Typography>
      
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Your Authentication Token
        </Typography>
        
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Copy this token and paste it in the desktop app to sign in:
        </Typography>
        
        {loading ? (
          <Typography>Generating token...</Typography>
        ) : (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={token}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.875rem' }
              }}
            />
            
            <Button
              variant="contained"
              startIcon={copied ? <CheckCircle /> : <ContentCopy />}
              onClick={copyToClipboard}
              sx={{ mt: 2 }}
              color={copied ? "success" : "primary"}
            >
              {copied ? 'Copied!' : 'Copy Token'}
            </Button>
          </Box>
        )}
        
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            This token expires in 1 hour. You can generate a new one anytime by visiting this page.
          </Typography>
        </Alert>
      </Paper>
    </Container>
  );
};

export default GenerateToken;