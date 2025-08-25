import React, { useState, useEffect } from "react";
import {
  Box,
  CssBaseline,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Typography,
  Chip,
  Breadcrumbs,
  Link,
  CircularProgress,
} from "@mui/material";
import { useNavigate, useLocation, useParams, Link as RouterLink } from "react-router-dom";
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';

// Import layout components
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";

// Import dashboard components
import { GmailMultiAccount } from "../components/GmailMultiAccount";
import JobsList from "../components/JobsList";

// Import analytics components
import QuickStats from "../components/analytics/QuickStats";
import analyticsService, { JobStats } from "../services/analytics.service";

// Import auth context
import { useAuth } from "../contexts/ElectronAuthContext";

// Model information
const modelInfo: Record<string, { name: string; description: string; color: string }> = {
  'qwen2.5-7b': { 
    name: 'Qwen2.5-7B', 
    description: 'Best overall - 32K context, excellent parsing',
    color: '#4CAF50'
  },
  'llama-3.1-8b': { 
    name: 'Llama-3.1-8B', 
    description: 'Massive 128K context for few-shot learning',
    color: '#2196F3'
  },
  'phi-3.5-mini-128k': { 
    name: 'Phi-3.5-mini', 
    description: 'Small model with huge 128K context window',
    color: '#FF9800'
  },
  'hermes-3-llama-8b': { 
    name: 'Hermes-3-Llama', 
    description: 'Function calling specialist - 128K context',
    color: '#9C27B0'
  },
  'qwen2.5-3b': { 
    name: 'Qwen2.5-3B', 
    description: 'Fast baseline - 32K context',
    color: '#F44336'
  },
};

export default function ModelDashboard() {
  const isElectron = !!window.electronAPI;
  const authData = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const { modelId } = useParams<{ modelId: string }>();
  
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: "", 
    severity: "success" as "success" | "error" 
  });

  // Analytics state
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<JobStats>({
    totalApplications: 0,
    appliedCount: 0,
    interviewedCount: 0,
    offerCount: 0,
    declinedCount: 0,
    responseRate: 0,
    interviewRate: 0,
    offerRate: 0,
  });
  const [weeklyTrend, setWeeklyTrend] = useState({ change: 0, isIncrease: false });
  const [modelStatus, setModelStatus] = useState<'checking' | 'ready' | 'not_installed' | 'error'>('checking');

  // For Electron, we use simplified auth
  const currentUser = isElectron ? authData.currentUser : authData.currentUser;
  const logout = isElectron ? authData.signOut : authData.logout;

  // Get model info
  const model = modelInfo[modelId || ''] || {
    name: 'Unknown Model',
    description: 'Model not found',
    color: '#666'
  };

  // Check if model is installed
  useEffect(() => {
    const checkModelStatus = async () => {
      if (!modelId || !window.electronAPI) return;
      
      try {
        const result = await window.electronAPI.models.getAllModels();
        if (result.success && result.statuses) {
          const status = result.statuses[modelId];
          if (status) {
            setModelStatus(status.status === 'ready' ? 'ready' : 'not_installed');
          } else {
            setModelStatus('error');
          }
        }
      } catch (error) {
        console.error('Failed to check model status:', error);
        setModelStatus('error');
      }
    };

    checkModelStatus();
  }, [modelId]);

  // Load jobs for this specific model
  useEffect(() => {
    const loadJobs = async () => {
      if (isElectron && window.electronAPI) {
        try {
          // For now, load all jobs but in future filter by model
          // Once we add model_used column to database, we can filter here
          const jobsData = await window.electronAPI.getJobs();
          setJobs(jobsData);
          
          // Transform and calculate stats
          const transformedJobs = jobsData.map((job: any) => ({
            id: job.id?.toString() || Math.random().toString(),
            userId: job.userId || 'electron-user',
            company: job.company || 'Unknown Company',
            jobTitle: job.position || job.jobTitle || 'Unknown Position',
            location: job.location || 'Unknown Location',
            status: job.status || 'Applied',
            appliedDate: new Date(job.applied_date || job.appliedDate || Date.now()),
            lastUpdated: new Date(job.lastUpdated || job.applied_date || Date.now()),
            source: 'gmail',
            emailId: job.emailId,
          }));
          
          const stats = analyticsService.calculateJobStats(transformedJobs);
          setJobStats(stats);
          
          const trend = analyticsService.getWeeklyTrend(transformedJobs);
          setWeeklyTrend(trend);
        } catch (error) {
          console.error('Failed to load jobs:', error);
        }
      }
    };
    
    loadJobs();
  }, [isElectron, modelId]);

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Modified sync handler to use specific model
  const handleSyncWithModel = async (options: any) => {
    // This will be called by GmailMultiAccount component
    // We need to pass the modelId to the sync process
    const syncOptions = {
      ...options,
      modelId: modelId,
    };
    
    // Call the modified sync handler that uses the specific model
    return window.electronAPI.gmail.syncAll(syncOptions);
  };

  if (modelStatus === 'checking') {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh", alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  if (modelStatus === 'not_installed') {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <CssBaseline />
          <Sidebar currentPath={location.pathname} />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="h6">{model.name} is not installed</Typography>
              <Typography variant="body2">
                Please go back to the Model Testing page and download this model first.
              </Typography>
            </Alert>
            <Link component={RouterLink} to="/model-testing">
              Go to Model Testing
            </Link>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: "flex", height: "100vh" }}>
        <CssBaseline />

        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar 
              currentUser={currentUser} 
              onLogout={handleLogout}
              title={`${model.name} Dashboard`}
            />
          </Box>

          {/* Breadcrumb Navigation */}
          <Box sx={{ px: 3, pt: 2 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
              <Link component={RouterLink} to="/model-testing" color="inherit">
                Model Testing
              </Link>
              <Typography color="text.primary">{model.name}</Typography>
            </Breadcrumbs>
          </Box>

          {/* Model Info Card */}
          <Box sx={{ px: 3, pt: 2 }}>
            <Card sx={{ mb: 2, borderLeft: `4px solid ${model.color}` }}>
              <CardContent sx={{ py: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {model.name}
                      <Chip 
                        label="Active Model" 
                        size="small" 
                        sx={{ 
                          backgroundColor: model.color,
                          color: 'white',
                          fontWeight: 600
                        }}
                      />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {model.description}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    All classifications below will use this model
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Main Content */}
          <Box 
            sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}
            className="page-enter gpu-accelerated"
          >
            {/* Analytics Overview */}
            {jobStats.totalApplications > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography 
                  variant="h2" 
                  sx={{ 
                    mb: 3, 
                    fontWeight: 600,
                    color: onlyJobsTheme.palette.text.primary 
                  }}
                >
                  Overview - {model.name}
                </Typography>
                <QuickStats stats={jobStats} weeklyTrend={weeklyTrend} />
              </Box>
            )}

            {/* Notice about model-specific sync */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Model-Specific Classification
              </Typography>
              <Typography variant="body2">
                When you sync emails below, they will be classified using {model.name}. 
                The classification prompt is shared across all models and can be edited in the AI Prompt page.
              </Typography>
            </Alert>

            {/* Gmail Account Management */}
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: onlyJobsTheme.palette.text.primary 
                  }}
                >
                  Gmail Accounts
                </Typography>
                <GmailMultiAccount />
              </CardContent>
            </Card>
            
            {/* Jobs List */}
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: onlyJobsTheme.palette.text.primary 
                  }}
                >
                  Applications Found by {model.name}
                </Typography>
                <JobsList />
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Snackbar for feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            onClose={handleSnackbarClose} 
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}