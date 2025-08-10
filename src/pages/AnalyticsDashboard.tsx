import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
  CssBaseline,
} from '@mui/material';
import { useTheme, ThemeProvider } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import { JobApplication } from '../types/api.types';
import analyticsService, { 
  JobStats, 
  TimeSeriesData, 
  PipelineData
} from '../services/analytics.service';
import QuickStats from '../components/analytics/QuickStats';
import ApplicationTrends from '../components/analytics/ApplicationTrends';
import PipelineVisualization from '../components/analytics/PipelineVisualization';
import { onlyJobsTheme } from '../theme';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import auth context
import { useAuth as useElectronAuth } from '../contexts/ElectronAuthContext';

export default function AnalyticsDashboard() {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const authData = useElectronAuth();
  
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');
  const [pipelineView, setPipelineView] = useState<'linear' | 'pie' | 'funnel'>('linear');

  // Auth variables
  const currentUser = authData.currentUser;
  const logout = authData.signOut;

  // Computed analytics data
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
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [pipelineData, setPipelineData] = useState<PipelineData[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState({ change: 0, isIncrease: false });

  // Load jobs data (different approach for Electron vs Web)
  useEffect(() => {
    const loadJobs = async () => {
      try {
        setLoading(true);
        setError(null);

        if (window.electronAPI) {
          // Electron version - get jobs from IPC
          const jobsData = await window.electronAPI.getJobs();
          
          // Transform the data to match JobApplication interface
          const transformedJobs: JobApplication[] = jobsData.map((job: any) => ({
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

          setJobs(transformedJobs);
        } else {
          // Web version - would use API service
          // For now, using empty array since web version uses Looker Studio
          setJobs([]);
        }
      } catch (err) {
        console.error('Failed to load jobs:', err);
        setError('Failed to load job application data');
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, []);

  // Update analytics when jobs or time range changes
  useEffect(() => {
    if (jobs.length > 0) {
      // Calculate job statistics
      const stats = analyticsService.calculateJobStats(jobs);
      setJobStats(stats);

      // Generate time series data
      const days = parseInt(timeRange);
      const timeSeries = analyticsService.generateTimeSeriesData(jobs, days);
      setTimeSeriesData(timeSeries);

      // Generate pipeline data
      const pipeline = analyticsService.generatePipelineData(jobs);
      setPipelineData(pipeline);

      // Calculate weekly trend
      const trend = analyticsService.getWeeklyTrend(jobs);
      setWeeklyTrend(trend);
    }
  }, [jobs, timeRange]);

  const handleTimeRangeChange = (_: React.MouseEvent<HTMLElement>, newTimeRange: string) => {
    if (newTimeRange !== null) {
      setTimeRange(newTimeRange as '7' | '30' | '90');
    }
  };

  const handlePipelineViewChange = (_: React.MouseEvent<HTMLElement>, newView: string) => {
    if (newView !== null) {
      setPipelineView(newView as 'linear' | 'pie' | 'funnel');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Loading state with layout
  if (loading) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <CssBaseline />
          <Sidebar currentPath={location.pathname} />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, pb: 0 }}>
              <TopBar 
                currentUser={currentUser ? {
                  displayName: currentUser.name,
                  email: currentUser.email
                } : undefined}
                onLogout={handleLogout}
                title="Analytics"
              />
            </Box>
            <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '400px',
                }}
              >
                <CircularProgress size={48} />
              </Box>
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  // Error state with layout
  if (error) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <CssBaseline />
          <Sidebar currentPath={location.pathname} />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, pb: 0 }}>
              <TopBar 
                currentUser={currentUser ? {
                  displayName: currentUser.name,
                  email: currentUser.email
                } : undefined}
                onLogout={handleLogout}
                title="Analytics"
              />
            </Box>
            <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
              <Alert severity="error">
                {error}
              </Alert>
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  // Web version notice with layout
  if (!window.electronAPI) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <CssBaseline />
          <Sidebar currentPath={location.pathname} />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, pb: 0 }}>
              <TopBar 
                currentUser={currentUser ? {
                  displayName: currentUser.name,
                  email: currentUser.email
                } : undefined}
                onLogout={handleLogout}
                title="Analytics"
              />
            </Box>
            <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
              <Alert severity="info">
                Analytics dashboard is available in the desktop application. 
                Web users can view analytics in the Looker Studio dashboard.
              </Alert>
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  // No data state with layout
  if (jobs.length === 0) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: "flex", height: "100vh" }}>
          <CssBaseline />
          <Sidebar currentPath={location.pathname} />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, pb: 0 }}>
              <TopBar 
                currentUser={currentUser ? {
                  displayName: currentUser.name,
                  email: currentUser.email
                } : undefined}
                onLogout={handleLogout}
                title="Analytics"
              />
            </Box>
            <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
              <Typography variant="h2" sx={{ mb: 2 }}>
                Analytics Dashboard
              </Typography>
              <Alert severity="info">
                No job applications found. Start applying to jobs and sync with Gmail to see analytics.
              </Alert>
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  // Main analytics dashboard with full layout
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
              currentUser={currentUser ? {
                displayName: currentUser.name,
                email: currentUser.email
              } : undefined}
              onLogout={handleLogout}
              title="Analytics"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            {/* Analytics Dashboard Header */}
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="body1"
                sx={{
                  color: theme.palette.text.secondary,
                  mb: 3,
                }}
              >
                Insights and trends from your job application activity
              </Typography>

              {/* Quick Stats */}
              <QuickStats stats={jobStats} weeklyTrend={weeklyTrend} />
            </Box>

            {/* Time Range Selector */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <ToggleButtonGroup
                value={timeRange}
                exclusive
                onChange={handleTimeRangeChange}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    borderColor: theme.palette.divider,
                    '&.Mui-selected': {
                      backgroundColor: theme.palette.primary.main,
                      color: theme.palette.primary.contrastText,
                    },
                  },
                }}
              >
                <ToggleButton value="7">Last 7 days</ToggleButton>
                <ToggleButton value="30">Last 30 days</ToggleButton>
                <ToggleButton value="90">Last 90 days</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Charts Grid */}
            <Grid container spacing={3}>
              {/* Application Trends */}
              <Grid size={{ xs: 12, lg: 8 }}>
                <ApplicationTrends data={timeSeriesData} chartType="line" />
              </Grid>

              {/* Pipeline Visualization */}
              <Grid size={{ xs: 12, lg: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                      <Typography
                        variant="h3"
                        sx={{
                          fontWeight: 600,
                          color: theme.palette.text.primary,
                        }}
                      >
                        Pipeline View
                      </Typography>
                      <ToggleButtonGroup
                        value={pipelineView}
                        exclusive
                        onChange={handlePipelineViewChange}
                        size="small"
                      >
                        <ToggleButton value="linear">Linear</ToggleButton>
                        <ToggleButton value="pie">Pie</ToggleButton>
                        <ToggleButton value="funnel">Funnel</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                    <PipelineVisualization data={pipelineData} view={pipelineView} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}