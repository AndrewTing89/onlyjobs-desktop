import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { getFunctions } from 'firebase/functions';

// Environment variable loading with multiple fallbacks
function getEnvVar(key: string): string | undefined {
  // Priority order: REACT_APP_ prefixed, VITE_ prefixed, electron window.env, direct process.env
  return (
    process.env[`REACT_APP_${key}`] ||  // Create React App format
    process.env[`VITE_${key}`] ||       // Vite format  
    (window as any)?.env?.[key] ||      // Electron preload exposed env
    process.env[key]                    // Direct env var
  );
}

function assertEnvVar(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    const possibleKeys = [
      `REACT_APP_${key}`,
      `VITE_${key}`, 
      `window.env.${key}`,
      key
    ].join(', ');
    
    throw new Error(
      `Firebase configuration error: Missing required environment variable "${key}".\n` +
      `Please set one of: ${possibleKeys}\n` +
      `Check your .env file or environment configuration.`
    );
  }
  return value;
}

// Firebase configuration with validation
const firebaseConfig = {
  apiKey: assertEnvVar('FIREBASE_API_KEY', getEnvVar('FIREBASE_API_KEY')),
  authDomain: assertEnvVar('FIREBASE_AUTH_DOMAIN', getEnvVar('FIREBASE_AUTH_DOMAIN')),
  databaseURL: getEnvVar('FIREBASE_DATABASE_URL'), // Optional
  projectId: assertEnvVar('FIREBASE_PROJECT_ID', getEnvVar('FIREBASE_PROJECT_ID')),
  storageBucket: assertEnvVar('FIREBASE_STORAGE_BUCKET', getEnvVar('FIREBASE_STORAGE_BUCKET')),
  messagingSenderId: assertEnvVar('FIREBASE_MESSAGING_SENDER_ID', getEnvVar('FIREBASE_MESSAGING_SENDER_ID')),
  appId: assertEnvVar('FIREBASE_APP_ID', getEnvVar('FIREBASE_APP_ID')),
  measurementId: getEnvVar('FIREBASE_MEASUREMENT_ID') // Optional
};

// Debug logging (mask sensitive data)
console.log('Firebase Config loaded:', {
  apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : 'MISSING',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId ? `${firebaseConfig.messagingSenderId.substring(0, 6)}...` : 'MISSING',
  appId: firebaseConfig.appId ? `${firebaseConfig.appId.substring(0, 15)}...` : 'MISSING',
  measurementId: firebaseConfig.measurementId || 'NOT_SET'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

// Gmail-specific Google provider with required scopes
export const gmailProvider = new GoogleAuthProvider();
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.labels');
gmailProvider.addScope('email');
gmailProvider.addScope('profile');

// Initialize Analytics (optional)
let analytics: any = null;
try {
  analytics = getAnalytics(app);
} catch (error) {
  console.warn('Firebase Analytics initialization failed (this is normal in Electron):', error);
}
export { analytics };

// Initialize Functions
export const functions = getFunctions(app);

export default app;