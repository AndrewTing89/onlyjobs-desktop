import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  GoogleAuthProvider,
  AuthError
} from 'firebase/auth';
import { auth, googleProvider, appleProvider, gmailProvider } from '../config/firebase';
import { gmailFetchService } from '../services/gmailFetch.service';

// Types
interface AuthContextType {
  // Current user
  currentUser: User | null;
  loading: boolean;
  
  // Auth methods
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  
  // Token management
  getIdToken: () => Promise<string | null>;
  getIdTokenResult: () => Promise<any | null>;
  
  // Gmail integration
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  checkGmailConnection: () => Promise<void>;
  isGmailConnected: boolean;
  getGmailToken: () => string | null;
  
  // Gmail fetch integration
  onGmailConnected: (user: User) => Promise<void>;
  syncIncremental: (user: User) => Promise<void>;
  
  // User state
  isEmailVerified: boolean;
  isNewUser: boolean;
}

// Create context
const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Custom hook to use auth
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development';

  // Listen for auth state changes
  useEffect(() => {
    // Check if we're in Electron and already authenticated
    if (window.electronAPI) {
      window.electronAPI.auth.isAuthenticated().then((result) => {
        if (result.success && result.authenticated) {
          // Create a mock user for Electron
          const mockUser = {
            uid: 'electron-user',
            email: 'user@onlyjobs.desktop',
            emailVerified: true,
            displayName: 'Desktop User',
            photoURL: null,
            phoneNumber: null,
            providerId: 'electron',
            isAnonymous: false,
            tenantId: null,
            metadata: {},
            providerData: [],
            refreshToken: '',
            delete: async () => {},
            getIdToken: async () => 'electron-token',
            getIdTokenResult: async () => ({ claims: {}, token: 'electron-token' }),
            reload: async () => {},
            toJSON: () => ({}),
          } as unknown as User;
          
          setCurrentUser(mockUser);
          setLoading(false);
          return;
        }
      });
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Check Gmail connection status when user is authenticated
  useEffect(() => {
    const checkConnection = async () => {
      if (currentUser) {
        try {
          const response = await fetch('https://manage-tokens-12002195951.us-central1.run.app/api/gmail/status', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${await currentUser.getIdToken()}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            setIsGmailConnected(data.connected);
            console.log('Gmail connection status:', data.connected);
          } else {
            setIsGmailConnected(false);
          }
        } catch (error) {
          console.error('Error checking Gmail connection:', error);
          setIsGmailConnected(false);
        }
      } else {
        setIsGmailConnected(false);
      }
    };
    
    checkConnection();
  }, [currentUser]);

  // Signup function
  const signup = async (email: string, password: string, displayName?: string) => {
    try {
      // Create user
      const result = await createUserWithEmailAndPassword(auth, email, password);
      setIsNewUser(true);
      
      // Update display name if provided
      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }
      
      // Send verification email
      if (result.user) {
        await sendEmailVerification(result.user);
      }
      
      // Log signup event (for analytics)
      console.log('New user signed up:', result.user.uid);
      
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  // Login function
  const login = async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      setIsNewUser(false);
      
      // Log login event
      console.log('User logged in:', result.user.uid);
      
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Google login
  const loginWithGoogle = async () => {
    try {
      // Add custom parameters for Google OAuth
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // Check if we're in Electron
      const isElectron = window.electronAPI !== undefined;
      
      let result;
      if (isElectron) {
        // In Electron, use popup sign-in
        result = await signInWithPopup(auth, googleProvider);
        
        // Check if it's a new user
        const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
        setIsNewUser(isNew);
        
        console.log('Google login successful in Electron:', result.user.uid);
      } else {
        // In web browser, use popup
        result = await signInWithPopup(auth, googleProvider);
        
        // Check if it's a new user
        const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
        setIsNewUser(isNew);
        
        // Get Google access token (might need for Gmail API later)
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        
        // Store Google token if needed for Gmail integration
        if (token) {
          sessionStorage.setItem('google_access_token', token);
        }
        
        console.log('Google login successful:', result.user.uid);
      }
      
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  // Apple login
  const loginWithApple = async () => {
    try {
      // Configure Apple OAuth
      appleProvider.addScope('email');
      appleProvider.addScope('name');
      
      const result = await signInWithPopup(auth, appleProvider);
      
      // Check if it's a new user
      const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      setIsNewUser(isNew);
      
      console.log('Apple login successful:', result.user.uid);
      
    } catch (error) {
      console.error('Apple login error:', error);
      throw error;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
      // Clear any stored tokens
      sessionStorage.removeItem('google_access_token');
      localStorage.removeItem('gmail_access_token');
      setIsGmailConnected(false);
      console.log('User logged out');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      console.log('Password reset email sent to:', email);
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (displayName: string) => {
    if (!currentUser) throw new Error('No user logged in');
    
    try {
      await updateProfile(currentUser, { displayName });
      console.log('Profile updated');
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  // Send verification email
  const sendVerificationEmail = async () => {
    if (!currentUser) throw new Error('No user logged in');
    
    try {
      await sendEmailVerification(currentUser);
      console.log('Verification email sent');
    } catch (error) {
      console.error('Verification email error:', error);
      throw error;
    }
  };

  // Get ID token for API calls
  const getIdToken = async (): Promise<string | null> => {
    if (!currentUser) return null;
    
    try {
      const token = await currentUser.getIdToken();
      return token;
    } catch (error) {
      console.error('Get ID token error:', error);
      return null;
    }
  };

  // Get ID token result (includes claims)
  const getIdTokenResult = async () => {
    if (!currentUser) return null;
    
    try {
      const tokenResult = await currentUser.getIdTokenResult();
      return tokenResult;
    } catch (error) {
      console.error('Get ID token result error:', error);
      return null;
    }
  };

  // Gmail integration functions
const connectGmail = async () => {
  if (!currentUser) throw new Error('No user logged in');

  try {
    // Check if we're in Electron
    const isElectron = window.electronAPI !== undefined;
    
    if (isElectron) {
      // In Electron, open the web app for Gmail connection
      // Always use the deployed Firebase URL for consistent OAuth experience
      const webAppUrl = 'https://onlyjobs-465420.web.app/settings?connect_gmail=true';
      
      // Open in system browser
      await window.electronAPI.openExternal(webAppUrl);
      
      // Show helpful message
      throw new Error('Opening web browser for Gmail connection. Please complete the Gmail authorization in your browser, then return to the desktop app.');
    }
    
    // Configure Gmail provider with Gmail scopes and offline access
    gmailProvider.setCustomParameters({
      prompt: 'consent',
      access_type: 'offline'
    });
    gmailProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
    gmailProvider.addScope('https://www.googleapis.com/auth/gmail.labels');

    const result = await signInWithPopup(auth, gmailProvider);

    // Get Gmail access token
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (token) {
      // Store Gmail token separately for API calls
      localStorage.setItem('gmail_access_token', token);
      setIsGmailConnected(true);
      console.log('Gmail connected successfully');

      // 🔁 Send token + Firebase ID token to backend
      const firebaseIdToken = await currentUser.getIdToken();

      await fetch("https://us-central1-onlyjobs-465420.cloudfunctions.net/manage-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          firebase_id_token: firebaseIdToken,
          gmail_access_token: token
        })
      });

      console.log('Tokens sent to backend');
      
      // Trigger backfill after successful connection
      await onGmailConnected(currentUser);
      
    } else {
      throw new Error('Failed to get Gmail access token');
    }

  } catch (error) {
    console.error('Gmail connection error:', error);
    throw error;
  }
};

  const disconnectGmail = async () => {
    try {
      // Call backend to disconnect and clean up tokens
      await fetch('https://manage-tokens-12002195951.us-central1.run.app/api/gmail/disconnect', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await currentUser?.getIdToken()}`,
          'Content-Type': 'application/json',
        },
      });
      
      // Remove stored Gmail token from local storage
      localStorage.removeItem('gmail_access_token');
      setIsGmailConnected(false);
      console.log('Gmail disconnected successfully');
    } catch (error) {
      console.error('Gmail disconnection error:', error);
      throw error;
    }
  };

  const checkGmailConnection = async () => {
    try {
      if (!currentUser) {
        return;
      }
      
      const response = await fetch('https://manage-tokens-12002195951.us-central1.run.app/api/gmail/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${await currentUser.getIdToken()}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsGmailConnected(data.connected);
      } else {
        setIsGmailConnected(false);
      }
    } catch (error) {
      setIsGmailConnected(false);
    }
  };

  const getGmailToken = (): string | null => {
    return localStorage.getItem('gmail_access_token');
  };

  // Gmail fetch integration functions
  const onGmailConnected = async (user: User) => {
    try {
      const uid = user.uid;
      console.log('🔄 Triggering Gmail backfill for user:', uid);
      
      // Trigger backfill to fetch up to 200 historical emails
      await gmailFetchService.triggerBackfill(uid);
      console.log('✅ Gmail backfill completed successfully');
      
    } catch (error) {
      console.error('❌ Gmail backfill failed:', error);
      throw error;
    }
  };

  const syncIncremental = async (user: User) => {
    try {
      const uid = user.uid;
      console.log('🔄 Triggering Gmail backfill sync for user:', uid);
      
      // Fetch emails with backfill=true (up to 500 emails)
      await gmailFetchService.triggerBackfill(uid);
      console.log('✅ Gmail backfill sync completed successfully');
      
    } catch (error) {
      console.error('❌ Gmail backfill sync failed:', error);
      throw error;
    }
  };

  // Context value
  const value: AuthContextType = {
    currentUser,
    loading,
    signup,
    login,
    logout,
    loginWithGoogle,
    loginWithApple,
    resetPassword,
    updateUserProfile,
    sendVerificationEmail,
    getIdToken,
    getIdTokenResult,
    connectGmail,
    disconnectGmail,
    checkGmailConnection,
    isGmailConnected,
    getGmailToken,
    onGmailConnected,
    syncIncremental,
    isEmailVerified: currentUser?.emailVerified || (window.electronAPI && currentUser?.uid === 'electron-user') || false,
    isNewUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Error handler helper
export const getAuthErrorMessage = (error: AuthError | Error): string => {
  // Check if it's our custom Electron error
  if (error.message && error.message.includes('Google sign-in is not yet supported in the desktop app')) {
    return error.message;
  }
  
  // Handle Firebase AuthError
  if ('code' in error) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/operation-not-allowed':
        return 'Operation not allowed.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/popup-closed-by-user':
        return 'Login popup was closed.';
      case 'auth/cancelled-popup-request':
        return 'Login popup was cancelled.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with the same email but different sign-in credentials.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
  
  return 'An unexpected error occurred. Please try again.';
};