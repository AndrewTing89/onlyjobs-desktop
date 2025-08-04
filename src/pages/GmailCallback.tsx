import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { gmailService } from '../services/gmail.service';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';

export default function GmailCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      const tempTokenId = searchParams.get('temp_token_id');
      const code = searchParams.get('code');
      const callbackKey = `oauth_processed_${tempTokenId || code}`;
      
      // Prevent duplicate execution using multiple checks
      if (isProcessing || hasProcessed.current || sessionStorage.getItem(callbackKey)) {
        console.log('🛑 Callback already processed or processing, skipping...');
        return;
      }
      
      hasProcessed.current = true;
      setIsProcessing(true);
      sessionStorage.setItem(callbackKey, 'true');
      
      try {
        console.log('🔄 Processing Gmail OAuth callback...');
        console.log('🔍 Current URL:', window.location.href);
        console.log('🔍 Search params:', window.location.search);
        
        const error = searchParams.get('error');
        
        if (error) {
          console.error('OAuth error:', error);
          setStatus('error');
          setError(`OAuth error: ${error}`);
          setTimeout(() => navigate('/settings?error=' + encodeURIComponent(error)), 3000);
          setIsProcessing(false);
          return;
        }

        // Handle new flow with temp_token_id
        if (tempTokenId) {
          console.log('📱 Temporary token ID received:', tempTokenId.substring(0, 8) + '...');
          
          // Wait for Firebase auth to be ready
          let authTimeout: NodeJS.Timeout | null = null;
          
          const user = await new Promise<any>((resolve, reject) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
              if (user) {
                console.log('✅ User authenticated:', user.email);
                if (authTimeout) clearTimeout(authTimeout);
                unsubscribe();
                resolve(user);
              } else {
                console.log('⏳ Waiting for authentication...');
                authTimeout = setTimeout(() => {
                  console.error('❌ No user authenticated after timeout');
                  unsubscribe();
                  reject(new Error('Please log in first'));
                }, 5000);
              }
            });
          }).catch((error) => {
            setStatus('error');
            setError(error.message);
            setTimeout(() => navigate('/login'), 3000);
            setIsProcessing(false);
            return null;
          });

          if (!user) {
            setIsProcessing(false);
            return;
          }

          console.log('🔄 Finalizing tokens...');
          await gmailService.finalizeTokens(tempTokenId);
          console.log('✅ Tokens finalized successfully');
          
          setStatus('success');
          // Clean up session storage on success
          sessionStorage.removeItem(callbackKey);
          setTimeout(() => navigate('/settings?success=gmail-connected'), 2000);
          return;
        }

        // Handle old flow with code (fallback)
        if (!code) {
          console.error('No authorization code or temp token received');
          setStatus('error');
          setError('No authorization data received');
          setTimeout(() => navigate('/settings?error=' + encodeURIComponent('No authorization data received')), 3000);
          setIsProcessing(false);
          return;
        }

        // Wait for Firebase auth to be ready
        let authTimeout: NodeJS.Timeout | null = null;
        
        const user = await new Promise<any>((resolve, reject) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
              console.log('✅ User authenticated:', user.email);
              if (authTimeout) clearTimeout(authTimeout);
              unsubscribe();
              resolve(user);
            } else {
              console.log('⏳ Waiting for authentication...');
              // If no user after 5 seconds, redirect to login
              authTimeout = setTimeout(() => {
                console.error('❌ No user authenticated after timeout');
                unsubscribe();
                reject(new Error('Please log in first'));
              }, 5000);
            }
          });
        }).catch((error) => {
          setStatus('error');
          setError(error.message);
          setTimeout(() => navigate('/login'), 3000);
          setIsProcessing(false);
          return null;
        });

        if (!user) {
          setIsProcessing(false);
          return;
        }

        console.log('📱 Authorization code received:', code.substring(0, 20) + '...');
        console.log('👤 Current user:', user.email);

        // Exchange the authorization code for tokens via our backend
        console.log('🔄 Exchanging authorization code for tokens...');
        await gmailService.handleOAuthCallback(code);
        
        console.log('✅ OAuth callback processed successfully');
        setStatus('success');
        // Clean up session storage on success
        sessionStorage.removeItem(callbackKey);
        setTimeout(() => navigate('/settings?success=gmail-connected'), 2000);
        
      } catch (error) {
        console.error('❌ Error processing OAuth callback:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process OAuth callback';
        setStatus('error');
        setError(errorMessage);
        setTimeout(() => navigate('/settings?error=' + encodeURIComponent(errorMessage)), 3000);
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]); // Removed currentUser to prevent duplicate calls

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
      {status === 'processing' && (
        <>
          <CircularProgress size={48} sx={{ color: '#FF7043', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
            Connecting your Gmail account...
          </Typography>
          <Typography variant="body2" sx={{ color: '#666', textAlign: 'center' }}>
            Please wait while we complete the connection.
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
          <Typography variant="h6" sx={{ mb: 1, textAlign: 'center' }}>
            Gmail Connected Successfully!
          </Typography>
          <Typography variant="body2" sx={{ color: '#666', textAlign: 'center' }}>
            Redirecting you back to settings...
          </Typography>
        </>
      )}

      {status === 'error' && (
        <>
          <Alert severity="error" sx={{ mb: 2, maxWidth: 400 }}>
            {error}
          </Alert>
          <Typography variant="body2" sx={{ color: '#666', textAlign: 'center' }}>
            Redirecting you back...
          </Typography>
        </>
      )}
    </Box>
  );
}