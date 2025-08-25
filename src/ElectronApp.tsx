import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ElectronAuthProvider, useAuth } from './contexts/ElectronAuthContext';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { onlyJobsTheme } from './theme';

// Lazy load only the pages we need for Electron
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const PromptEditor = lazy(() => import('./pages/PromptEditor'));
const ModelTestingPage = lazy(() => import('./pages/ModelTestingPage'));
const ModelDashboard = lazy(() => import('./pages/ModelDashboard'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TestIPC = lazy(() => import('./pages/TestIPC'));
const NotFound = lazy(() => import('./pages/NotFound'));
const About = lazy(() => import('./pages/About'));

const accent = "#FF7043";

function ElectronAuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, signIn } = useAuth();
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  
  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh' 
      }}>
        <CircularProgress sx={{ color: accent }} />
        <Typography sx={{ mt: 2 }}>Checking authentication...</Typography>
      </Box>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        p: 4
      }}>
        <Typography variant="h4" gutterBottom sx={{ color: accent, fontWeight: 600 }}>
          Welcome to OnlyJobs Desktop
        </Typography>
        <Typography sx={{ mb: 4, textAlign: 'center' }}>
          Sign in with your Google account to get started
        </Typography>
        <Button 
          variant="contained"
          onClick={handleSignIn}
          disabled={isSigningIn}
          size="large"
          sx={{ 
            background: accent,
            px: 4,
            py: 1.5,
            '&:hover': { background: accent }
          }}
        >
          {isSigningIn ? <CircularProgress size={24} color="inherit" /> : 'Sign in with Google'}
        </Button>
      </Box>
    );
  }
  
  return <>{children}</>;
}

function ElectronApp() {
  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <CssBaseline />
      <Router>
        <ElectronAuthProvider>
          <ElectronAuthGuard>
            <Suspense fallback={<LoadingSpinner fullScreen />}>
              <Routes>
                {/* Default route - go to dashboard */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                {/* Main app routes */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/analytics" element={<AnalyticsDashboard />} />
                <Route path="/prompt-editor" element={<PromptEditor />} />
                <Route path="/model-testing" element={<ModelTestingPage />} />
                <Route path="/model-testing/:modelId" element={<ModelDashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about" element={<About />} />
                
                {/* Utility routes */}
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/test-ipc" element={<TestIPC />} />
                
                {/* Catch all */}
                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </Suspense>
          </ElectronAuthGuard>
        </ElectronAuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default ElectronApp;