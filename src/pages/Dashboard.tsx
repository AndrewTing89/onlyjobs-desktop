import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  CssBaseline,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Typography,
  Button,
} from "@mui/material";
import { Add } from "@mui/icons-material";
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
import AddJobDialog from "../components/AddJobDialog";

// Import analytics components
import QuickStats from "../components/analytics/QuickStats";
import analyticsService, { JobStats } from "../services/analytics.service";

// Import filter components
import { JobsFilter } from "../components/filters";
import { useJobFilters } from "../hooks/useJobFilters";
import { Job, JobStatus } from "../types/filter.types";

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

  // Dialog state for manual job addition
  const [addJobDialogOpen, setAddJobDialogOpen] = useState(false);

  // Analytics state
  const [jobs, setJobs] = useState<Job[]>([]);
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

  // Initialize job filters
  const {
    filterState,
    filterOptions,
    filteredJobs,
    jobCount,
    actions: filterActions,
  } = useJobFilters(jobs);

  // Calculate filtered stats for analytics
  const filteredStats = useMemo(() => {
    if (filteredJobs.length === 0) return jobStats;
    
    // Transform filtered jobs to analytics format
    const analyticsJobs = filteredJobs.map((job) => ({
      id: job.id,
      userId: 'electron-user',
      company: job.company,
      jobTitle: job.position,
      location: job.location || 'Unknown Location',
      status: job.status as JobStatus,
      appliedDate: new Date(job.applied_date),
      lastUpdated: new Date(job.updated_at),
      source: 'gmail' as const,
      emailId: job.email_id,
    }));
    
    return analyticsService.calculateJobStats(analyticsJobs);
  }, [filteredJobs, jobStats]);

  // For Electron, we use simplified auth
  const currentUser = isElectron ? authData.currentUser : authData.currentUser;
  const logout = isElectron ? authData.signOut : authData.logout;

  // Load jobs for dashboard stats
  useEffect(() => {
    const loadJobs = async () => {
      if (isElectron && window.electronAPI) {
        try {
          const jobsData = await window.electronAPI.getJobs();
          
          // Transform jobs data to match our Job interface
          const transformedJobs: Job[] = jobsData.map((job: any) => ({
            id: job.id?.toString() || Math.random().toString(),
            company: job.company || 'Unknown Company',
            position: job.position || 'Unknown Position',
            status: job.status || 'Applied',
            job_type: job.job_type,
            applied_date: job.applied_date || new Date().toISOString(),
            location: job.location,
            salary_range: job.salary_range,
            notes: job.notes,
            email_id: job.email_id,
            created_at: job.created_at || new Date().toISOString(),
            updated_at: job.updated_at || new Date().toISOString(),
            account_email: job.account_email,
            from_address: job.from_address,
            raw_content: job.raw_content,
          }));
          
          setJobs(transformedJobs);
          
          // Transform for analytics (keeping existing format)
          const analyticsJobs = transformedJobs.map((job) => ({
            id: job.id,
            userId: 'electron-user',
            company: job.company,
            jobTitle: job.position,
            location: job.location || 'Unknown Location',
            status: job.status as JobStatus,
            appliedDate: new Date(job.applied_date),
            lastUpdated: new Date(job.updated_at),
            source: 'gmail' as const,
            emailId: job.email_id,
          }));
          
          const stats = analyticsService.calculateJobStats(analyticsJobs);
          setJobStats(stats);
          
          const trend = analyticsService.getWeeklyTrend(analyticsJobs);
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

  // Handle dialog close
  const handleAddJobDialogClose = () => {
    setAddJobDialogOpen(false);
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
                    <QuickStats 
                      stats={filteredStats}
                      weeklyTrend={weeklyTrend} 
                    />
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
                
                {/* Jobs Filter */}
                <JobsFilter
                  filterState={filterState}
                  filterOptions={filterOptions}
                  onFilterChange={filterActions.updateFilter}
                  jobCount={jobCount}
                />
                
                {/* Jobs List */}
                <Card>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Typography 
                        variant="h3" 
                        sx={{ 
                          fontWeight: 600,
                          color: onlyJobsTheme.palette.text.primary 
                        }}
                      >
                        Job Applications
                      </Typography>
                      <Button
                        variant="contained"
                        size="medium"
                        startIcon={<Add />}
                        onClick={() => setAddJobDialogOpen(true)}
                        sx={{
                          minWidth: 140,
                          '&:hover': {
                            transform: 'translateY(-1px)',
                            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)'
                          }
                        }}
                      >
                        Add Job
                      </Button>
                    </Box>
                    <JobsList 
                      jobs={filteredJobs}
                      searchTerm={filterState.searchTerm}
                      onSearchChange={filterActions.updateSearchTerm}
                      onJobUpdated={(updatedJob) => {
                        // Update the jobs state and recalculate analytics
                        setJobs(prevJobs => {
                          const newJobs = prevJobs.map(job => 
                            job.id === updatedJob.id ? updatedJob : job
                          );
                          
                          // Recalculate analytics for updated jobs
                          const analyticsJobs = newJobs.map((job) => ({
                            id: job.id,
                            userId: 'electron-user',
                            company: job.company,
                            jobTitle: job.position,
                            location: job.location || 'Unknown Location',
                            status: job.status as JobStatus,
                            appliedDate: new Date(job.applied_date),
                            lastUpdated: new Date(job.updated_at),
                            source: 'gmail' as const,
                            emailId: job.email_id,
                          }));
                          
                          const stats = analyticsService.calculateJobStats(analyticsJobs);
                          setJobStats(stats);
                          
                          const trend = analyticsService.getWeeklyTrend(analyticsJobs);
                          setWeeklyTrend(trend);
                          
                          return newJobs;
                        });
                      }}
                      onJobCreated={(newJob) => {
                        // Add the new job and recalculate analytics
                        setJobs(prevJobs => {
                          const newJobs = [...prevJobs, newJob];
                          
                          // Recalculate analytics for all jobs including the new one
                          const analyticsJobs = newJobs.map((job) => ({
                            id: job.id,
                            userId: 'electron-user',
                            company: job.company,
                            jobTitle: job.position,
                            location: job.location || 'Unknown Location',
                            status: job.status as JobStatus,
                            appliedDate: new Date(job.applied_date),
                            lastUpdated: new Date(job.updated_at),
                            source: 'gmail' as const,
                            emailId: job.email_id,
                          }));
                          
                          const stats = analyticsService.calculateJobStats(analyticsJobs);
                          setJobStats(stats);
                          
                          const trend = analyticsService.getWeeklyTrend(analyticsJobs);
                          setWeeklyTrend(trend);
                          
                          return newJobs;
                        });
                      }}
                    />
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

        {/* Add Job Dialog */}
        {isElectron && (
          <AddJobDialog
            open={addJobDialogOpen}
            onClose={handleAddJobDialogClose}
            onJobCreated={(newJob) => {
              // Add the new job and recalculate analytics
              setJobs(prevJobs => {
                const newJobs = [...prevJobs, newJob];
                
                // Recalculate analytics for all jobs including the new one
                const analyticsJobs = newJobs.map((job) => ({
                  id: job.id,
                  userId: 'electron-user',
                  company: job.company,
                  jobTitle: job.position,
                  location: job.location || 'Unknown Location',
                  status: job.status as JobStatus,
                  appliedDate: new Date(job.applied_date),
                  lastUpdated: new Date(job.updated_at),
                  source: 'gmail' as const,
                  emailId: job.email_id,
                }));
                
                const stats = analyticsService.calculateJobStats(analyticsJobs);
                setJobStats(stats);
                
                const trend = analyticsService.getWeeklyTrend(analyticsJobs);
                setWeeklyTrend(trend);
                
                return newJobs;
              });
              
              // Show success message
              setSnackbar({
                open: true,
                message: 'Job application added successfully!',
                severity: 'success'
              });
              
              handleAddJobDialogClose();
            }}
          />
        )}
      </Box>
    </ThemeProvider>
  );
} 