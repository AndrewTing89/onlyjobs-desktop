import React, { useEffect, useState } from 'react';
import { Box, Alert, CircularProgress, Typography } from '@mui/material';
import { useAuth as useFirebaseAuth } from '../contexts/AuthContext';
import { useAuth as useElectronAuth } from '../contexts/ElectronAuthContext';

const useAuth = window.electronAPI ? useElectronAuth : useFirebaseAuth;

interface LookerDashboardProps {
  baseUrl?: string;
  height?: string;
  width?: string;
}

export const LookerDashboard: React.FC<LookerDashboardProps> = ({
  baseUrl,
  height = '100vh',
  width = '100%'
}) => {
  const authData = useAuth() as any;
  const currentUser = authData.currentUser || authData.user;
  const [reportUrl, setReportUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState(0);

  // Base URL from Looker Studio embed code
  const BASE_URL = baseUrl || 'https://lookerstudio.google.com/embed/reporting/1cc5e22e-a799-4845-9b3c-f57866d86b18/page/jSfSF';

  useEffect(() => {
    if (!currentUser) {
      setReportUrl('');
      setLoading(false);
      return;
    }

    try {
      console.log('🔍 Building Looker Studio URL for user:', currentUser.uid);
      console.log('🔍 User email:', currentUser.email);
      
      // Validate BASE_URL exists
      if (!BASE_URL) {
        setError('Looker Studio base URL not configured');
        setLoading(false);
        return;
      }

      // Try multiple parameter formats for Looker Studio row-level security
      const paramFormats = [
        // Format 1: Using email (most common for Looker Studio RLS)  
        `${BASE_URL}?p_user_id=${encodeURIComponent(currentUser.email || '')}`,
        
        // Format 2: Direct parameter with & (if base URL has params)
        `${BASE_URL}&p_user_id=${encodeURIComponent(currentUser.email || '')}`,
        
        // Format 3: Using UID
        `${BASE_URL}?p_user_id=${encodeURIComponent(currentUser.uid)}`,
        
        // Format 4: Using config parameter with email
        `${BASE_URL}?config=${encodeURIComponent(JSON.stringify({ user_id: currentUser.email }))}`,
        
        // Format 5: Simple user parameter
        `${BASE_URL}?user=${encodeURIComponent(currentUser.email || '')}`,
        
        // Format 6: No parameters (show all data for debugging)
        BASE_URL
      ];

      // Use selected format
      const finalUrl = paramFormats[selectedFormat];
      
      console.log('✅ Looker Studio URL constructed:', finalUrl);
      console.log('🔍 Alternative formats available:', paramFormats.length);
      console.log('🔍 User data being passed:', {
        uid: currentUser.uid,
        email: currentUser.email
      });
      
      setReportUrl(finalUrl);
      setError(null);
      setLoading(false);

    } catch (err) {
      console.error('❌ Error constructing Looker Studio URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setLoading(false);
    }
  }, [currentUser, BASE_URL, selectedFormat]);

  // Handle loading state
  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height,
        width 
      }}>
        <CircularProgress size={40} />
        <Typography variant="body2" sx={{ mt: 2, color: '#666' }}>
          Loading your dashboard...
        </Typography>
        <Typography variant="caption" sx={{ color: '#999', display: 'block', mt: 1 }}>
          User: {currentUser?.uid || 'Not authenticated'}
        </Typography>
      </Box>
    );
  }

  // Handle not authenticated
  if (!currentUser) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="warning">Please log in to view your dashboard.</Alert>
      </Box>
    );
  }

  // Handle error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <Typography variant="h6">Dashboard Error</Typography>
          <Typography variant="body2">{error}</Typography>
          <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
            If you continue to see this error, please check that:
            <br />• The Looker Studio base URL is properly configured
            <br />• Your browser allows embedded content from Looker Studio
          </Typography>
        </Alert>
      </Box>
    );
  }

  // Handle no URL (shouldn't happen if we reach here, but safety check)
  if (!reportUrl) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="info">Dashboard URL not available.</Alert>
      </Box>
    );
  }

  // Render the iframe with the secure URL
  return (
    <Box sx={{ 
      position: 'relative', 
      width, 
      height,
      '& iframe': {
        border: 'none',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }
    }}>
      <iframe
        title="Job Applications Dashboard"
        src={reportUrl}
        width="1670"
        height="870"
        allowFullScreen
        style={{ 
          border: 'none',
          borderRadius: '12px',
          overflow: 'hidden',
          maxWidth: '100%',
          maxHeight: '100%',
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }}
        onLoad={() => {
          console.log('✅ Looker Studio dashboard loaded successfully');
          console.log('🔍 Final URL being loaded:', reportUrl);
        }}
        onError={(e) => {
          console.error('❌ Error loading Looker Studio dashboard:', e);
          setError('Failed to load dashboard iframe');
        }}
      />
    </Box>
  );
};