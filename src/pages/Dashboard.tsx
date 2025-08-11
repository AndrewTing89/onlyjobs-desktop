import React, { useState, useEffect } from "react";
import {
  Box,
  CssBaseline,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';

// Import new layout components
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";

// Import existing components
import { LookerDashboard } from "../components/LookerDashboard";
import { GmailMultiAccount } from "../components/GmailMultiAccount";
import JobsList from "../components/JobsList";

// Import analytics components
import QuickStats from "../components/analytics/QuickStats";
import analyticsService, { JobStats } from "../services/analytics.service";

// Import the appropriate auth context based on environment
import { useAuth as useFirebaseAuth } from "../contexts/AuthContext";
import { useAuth as useElectronAuth } from "../contexts/ElectronAuthContext";

const useAuth = window.electronAPI ? useElectronAuth : useFirebaseAuth;

export default function Dashboard() {
  const isElectron = !!window.electronAPI;
  const authData = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  
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

  // For Electron, we use simplified auth
  const currentUser = isElectron ? authData.currentUser : authData.currentUser;
  const logout = isElectron ? authData.signOut : authData.logout;

  // Load jobs for dashboard stats
  useEffect(() => {
    const loadJobs = async () => {
      if (isElectron && window.electronAPI) {
        try {
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
  }, [isElectron]);

  // Skip Gmail sync for Electron - it handles email differently
  useEffect(() => {
    if (!isElectron && currentUser && authData.checkGmailConnection) {
      authData.checkGmailConnection();
      
      // Trigger incremental sync if Gmail is connected
      if (authData.isGmailConnected) {
        authData.syncIncremental(currentUser).catch((error: any) => {
          console.error('Dashboard incremental sync failed:', error);
          // Show error in snackbar but don't block UI
          setSnackbar({
            open: true,
            message: 'Failed to sync emails',
            severity: 'error'
          });
        });
      }
    }
  }, [currentUser, isElectron]);


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
              title="Dashboard"
            />
          </Box>

          {/* Main Content */}
          <Box 
            sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}
            className="page-enter gpu-accelerated"
          >
            {isElectron ? (
              <>
                {/* Analytics Overview for Electron */}
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
                      Overview
                    </Typography>
                    <QuickStats stats={jobStats} weeklyTrend={weeklyTrend} />
                  </Box>
                )}

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
                      Recent Applications
                    </Typography>
                    <JobsList />
                  </CardContent>
                </Card>
              </>
            ) : (
              /* Looker Studio Dashboard for web */
              <Box sx={{ height: 'calc(100vh - 200px)', width: '100%' }}>
                <LookerDashboard height="100%" />
              </Box>
            )}
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