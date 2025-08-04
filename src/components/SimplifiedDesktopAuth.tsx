import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  CircularProgress, 
  Typography,
  Alert,
  Card,
  CardContent,
  TextField
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const accent = "#FF7043";

export default function SimplifiedDesktopAuth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      // Navigation will happen via useEffect when currentUser updates
    } catch (error: any) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', borderRadius: 3, boxShadow: 3 }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h5" align="center" gutterBottom sx={{ color: accent, fontWeight: 600 }}>
          Sign in to OnlyJobs Desktop
        </Typography>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Desktop App Setup
          </Typography>
          <Typography variant="body2">
            1. Sign in with Google at <strong>onlyjobs-465420.web.app</strong>
          </Typography>
          <Typography variant="body2">
            2. Use the same email and your Google password below
          </Typography>
        </Alert>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleLogin}>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            sx={{ mb: 3 }}
          />
          
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            sx={{ mb: 3 }}
          />
          
          <Button
            fullWidth
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
            sx={{
              background: accent,
              borderRadius: 2,
              py: 1.5,
              fontSize: 16,
              textTransform: 'none',
              '&:hover': { background: accent }
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
          </Button>
        </Box>
        
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button
            onClick={() => window.electronAPI?.openExternal('https://onlyjobs-465420.web.app')}
            sx={{ color: accent }}
          >
            Open OnlyJobs Web →
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}