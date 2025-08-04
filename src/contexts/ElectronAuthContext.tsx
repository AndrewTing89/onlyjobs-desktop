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
    checkAuth();
    
    // Listen for auth events
    if (window.electronAPI) {
      window.electronAPI.onAuthSuccess((data: any) => {
        console.log('ElectronAuth: Auth success:', data);
        if (data.user) {
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        }
        setLoading(false);
      });
      
      window.electronAPI.onAuthError((error: string) => {
        console.error('ElectronAuth: Auth error:', error);
        setIsAuthenticated(false);
        setCurrentUser(null);
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
      await window.electronAPI.auth.signIn();
      // Auth success will be handled by the event listener
    } catch (error) {
      console.error('ElectronAuth: Sign in error:', error);
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