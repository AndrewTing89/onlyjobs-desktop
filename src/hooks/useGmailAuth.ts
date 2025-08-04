import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/ElectronAuthContext';

export function useGmailAuth() {
  const { isAuthenticated } = useAuth();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [checkingGmail, setCheckingGmail] = useState(true);
  
  useEffect(() => {
    checkGmailAccess();
  }, [isAuthenticated]);
  
  const checkGmailAccess = async () => {
    if (!isAuthenticated || !window.electronAPI) {
      setCheckingGmail(false);
      return;
    }
    
    try {
      // Check if we have Gmail tokens from the main auth
      const authTokens = await window.electronAPI.auth.getTokens();
      
      if (authTokens.success && authTokens.tokens) {
        // Check if tokens include Gmail scopes
        const scopes = authTokens.tokens.scopes || [];
        const hasGmailScope = scopes.some((scope: string) => 
          scope.includes('gmail.readonly') || scope.includes('gmail.labels')
        );
        
        setGmailConnected(hasGmailScope);
        
        // If we have Gmail scope from main auth, we can use those tokens
        if (hasGmailScope) {
          console.log('Gmail access already granted through main authentication');
        }
      }
    } catch (error) {
      console.error('Error checking Gmail access:', error);
    } finally {
      setCheckingGmail(false);
    }
  };
  
  const connectGmail = async () => {
    // If Gmail not connected through main auth, use separate Gmail auth
    try {
      const result = await window.electronAPI.gmail.authenticate();
      if (result.success) {
        setGmailConnected(true);
        return true;
      }
    } catch (error) {
      console.error('Gmail connection error:', error);
      throw error;
    }
    return false;
  };
  
  const fetchEmails = async (options?: any) => {
    // Try to use main auth tokens first
    const authTokens = await window.electronAPI.auth.getTokens();
    
    if (authTokens.success && authTokens.tokens) {
      // Use the main auth tokens for Gmail API
      // This would need to be implemented in the IPC handler
      return window.electronAPI.gmail.fetchEmails(options);
    }
    
    // Fall back to Gmail-specific auth
    return window.electronAPI.gmail.fetchEmails(options);
  };
  
  return {
    gmailConnected,
    checkingGmail,
    connectGmail,
    fetchEmails,
    checkGmailAccess
  };
}