// App.tsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingSpinner } from './components/LoadingSpinner';
import ElectronApp from './ElectronApp';

// Lazy load pages (create placeholder components for now)
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Settings = lazy(() => import('./pages/Settings'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const GmailCallback = lazy(() => import('./pages/GmailCallback'));
const OAuthTest = lazy(() => import('./pages/OAuthTest'));
const ElectronOAuthSuccess = lazy(() => import('./pages/ElectronOAuthSuccess'));
const MLTestPage = lazy(() => import('./pages/MLTestPage'));
const TestIPC = lazy(() => import('./pages/TestIPC'));
const ElectronBridge = lazy(() => import('./pages/ElectronBridge'));
const ElectronAuth = lazy(() => import('./pages/ElectronAuth'));
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  // Check if running in Electron
  const isElectron = window.electronAPI !== undefined;
  
  // If in Electron, use the simplified Electron app
  if (isElectron) {
    return <ElectronApp />;
  }
  
  // Otherwise, use the regular web app with Firebase auth
  const AppContent = () => (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <Routes>
            {/* Public routes */}
            <Route path="/" element={isElectron ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
            <Route path="/login" element={isElectron ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
            <Route path="/signup" element={isElectron ? <Navigate to="/dashboard" replace /> : <SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/callback" element={<GmailCallback />} />
            <Route path="/oauth-test" element={<OAuthTest />} />
            <Route path="/oauth-success" element={<ElectronOAuthSuccess />} />
            <Route path="/electron-bridge" element={<ElectronBridge />} />
            <Route path="/electron-auth" element={<ElectronAuth />} />
            
            {/* Semi-protected route (logged in but email not verified) */}
            <Route 
              path="/verify-email" 
              element={
                <ProtectedRoute>
                  <VerifyEmail />
                </ProtectedRoute>
              } 
            />
            
            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute requireEmailVerification>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/settings"
              element={
                <ProtectedRoute requireEmailVerification>
                  <Settings />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/ml-test"
              element={
                <ProtectedRoute>
                  <MLTestPage />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/test-ipc"
              element={
                <ProtectedRoute>
                  <TestIPC />
                </ProtectedRoute>
              }
            />
            
            {/* Catch all */}
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
    </Suspense>
  );
  
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;