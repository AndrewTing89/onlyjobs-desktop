import React, { createContext, useContext, useState, useEffect } from 'react';

interface ElectronUser {
  email: string;
  name?: string;
  picture?: string;
}

interface ElectronAuthContextType {
  currentUser: ElectronUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ElectronAuthContext = createContext<ElectronAuthContextType>({
  currentUser: null,
  loading: true,
  isAuthenticated: false,
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(ElectronAuthContext);

export const ElectronAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ElectronUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    console.log('🔵 ElectronAuthContext: Component mounted, checking auth...');
    checkAuth();
    
    // Listen for auth events
    if (window.electronAPI) {
      console.log('🔵 ElectronAuthContext: Setting up IPC listeners...');
      
      window.electronAPI.onAuthSuccess((data: any) => {
        console.log('🟢 ElectronAuthContext: Auth success event received:', data);
        if (data && data.user) {
          console.log('🔵 ElectronAuthContext: Updating user state:', data.user);
          setCurrentUser(data.user);
          setIsAuthenticated(true);
          console.log('🟢 ElectronAuthContext: State updated - isAuthenticated set to true');
        } else if (data && data.tokens) {
          // Sometimes user data comes in tokens
          console.log('🔵 ElectronAuthContext: User data in tokens:', data.tokens);
          const user = {
            email: data.tokens.email || 'user@onlyjobs.desktop',
            name: data.tokens.name,
            picture: data.tokens.picture
          };
          setCurrentUser(user);
          setIsAuthenticated(true);
          console.log('🟢 ElectronAuthContext: State updated via tokens - isAuthenticated set to true');
        } else {
          console.error('⚠️ ElectronAuthContext: No user data in auth success event');
        }
        setLoading(false);
      });
      
      window.electronAPI.onAuthError((error: string) => {
        console.error('🔴 ElectronAuthContext: Auth error event received:', error);
        setIsAuthenticated(false);
        setCurrentUser(null);
        setLoading(false);
      });
    } else {
      console.error('🔴 ElectronAuthContext: window.electronAPI not available!');
    }
    
    return () => {
      console.log('🔵 ElectronAuthContext: Cleaning up listeners...');
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('auth-success');
        window.electronAPI.removeAllListeners('auth-error');
      }
    };
  }, []);

  const checkAuth = async () => {
    if (!window.electronAPI) {
      setLoading(false);
      return;
    }
    
    try {
      const result = await window.electronAPI.auth.isAuthenticated();
      console.log('ElectronAuth: Check auth result:', result);
      
      if (result.success && result.authenticated) {
        setIsAuthenticated(true);
        // Get stored tokens to extract user info
        const tokenResult = await window.electronAPI.auth.getTokens();
        if (tokenResult.success && tokenResult.tokens) {
          // Extract user info from tokens if available
          setCurrentUser({
            email: tokenResult.tokens.email || 'user@onlyjobs.desktop',
            name: tokenResult.tokens.name,
            picture: tokenResult.tokens.picture
          });
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    } catch (error) {
      console.error('ElectronAuth: Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    try {
      setLoading(true);
      console.log('🔵 ElectronAuthContext: Starting sign in...');
      
      // Actually initiate sign-in
      console.log('🔵 ElectronAuthContext: Calling window.electronAPI.auth.signIn()...');
      const result = await window.electronAPI.auth.signIn();
      console.log('🟢 ElectronAuthContext: Sign in IPC call returned:', result);
      
      // If we got user data directly, update state immediately
      if (result?.success) {
        if (result.user) {
          console.log('🟢 ElectronAuthContext: Got user data directly from IPC:', result.user);
          setCurrentUser(result.user);
          setIsAuthenticated(true);
          setLoading(false);
          console.log('🟢 ElectronAuthContext: Navigation should occur now - isAuthenticated is true');
          return; // Success - exit early
        } else if (result.tokens) {
          console.log('🟢 ElectronAuthContext: Got tokens from IPC, extracting user info');
          const user = {
            email: result.tokens.email || 'user@onlyjobs.desktop',
            name: result.tokens.name,
            picture: result.tokens.picture
          };
          setCurrentUser(user);
          setIsAuthenticated(true);
          setLoading(false);
          console.log('🟢 ElectronAuthContext: Navigation should occur now - isAuthenticated is true');
          return; // Success - exit early
        }
      }
      console.log('⚠️ ElectronAuthContext: No user data in IPC response, will rely on events/polling');
      
      // If no immediate result, start polling as fallback
      console.log('ElectronAuth: No immediate result, starting fallback polling...');
      let pollCount = 0;
      const maxPolls = 10; // Poll for up to 10 seconds
      const pollInterval = setInterval(async () => {
        pollCount++;
        console.log(`ElectronAuth: Polling auth status (${pollCount}/${maxPolls})...`);
        
        try {
          const authResult = await window.electronAPI.auth.isAuthenticated();
          console.log('ElectronAuth: Poll result:', authResult);
          
          if (authResult?.success && authResult?.authenticated) {
            console.log('ElectronAuth: Authentication detected via polling!');
            clearInterval(pollInterval);
            
            // Get user info
            const tokenResult = await window.electronAPI.auth.getTokens();
            if (tokenResult?.success && tokenResult?.tokens) {
              setCurrentUser({
                email: tokenResult.tokens.email || 'user@onlyjobs.desktop',
                name: tokenResult.tokens.name,
                picture: tokenResult.tokens.picture
              });
              setIsAuthenticated(true);
              setLoading(false);
            }
          }
        } catch (err) {
          console.error('ElectronAuth: Poll error:', err);
        }
        
        if (pollCount >= maxPolls) {
          console.log('ElectronAuth: Polling timeout');
          clearInterval(pollInterval);
          setLoading(false);
        }
      }, 1000);
    } catch (error) {
      console.error('ElectronAuth: Sign in error:', error);
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await window.electronAPI.auth.signOut();
      setCurrentUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('ElectronAuth: Sign out error:', error);
      throw error;
    }
  };

  const value = {
    currentUser,
    loading,
    isAuthenticated,
    signIn,
    signOut
  };

  return (
    <ElectronAuthContext.Provider value={value}>
      {children}
    </ElectronAuthContext.Provider>
  );
};