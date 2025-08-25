import React, { useState, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  Typography,
  Card,
  CardContent,
  Divider,
  Chip,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import Grid from '@mui/material/Grid';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import icons
import {
  Speed,
  Memory,
  CloudQueue,
  Storage,
  Email,
  CheckCircle,
  TrendingUp,
  Psychology,
  School,
  FilterAlt,
  Timeline,
  DataUsage
} from '@mui/icons-material';

// Import auth context
import { useAuth } from '../contexts/ElectronAuthContext';

export default function About() {
  const location = useLocation();
  const { currentUser, signOut } = useAuth();
  const [mlStats, setMlStats] = useState<any>(null);

  useEffect(() => {
    loadMLStats();
  }, []);

  const loadMLStats = async () => {
    try {
      if (window.electronAPI?.ml?.getStats) {
        const result = await window.electronAPI.ml.getStats();
        if (result.success) {
          setMlStats(result.stats);
        }
      }
    } catch (error) {
      console.error('Error loading ML stats:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <CssBaseline />

        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar 
              currentUser={{
                displayName: currentUser?.name || 'User',
                email: currentUser?.email || 'user@example.com'
              }} 
              onLogout={handleLogout}
              title="About OnlyJobs"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            
            {/* Hero Section */}
            <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent sx={{ p: 4, color: 'white' }}>
                <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
                  OnlyJobs: AI-Powered Job Application Tracking
                </Typography>
                <Typography variant="body1">
                  A desktop application that intelligently processes your Gmail to automatically track job applications 
                  using a two-tier classification system that combines machine learning with large language models.
                </Typography>
              </CardContent>
            </Card>

            {/* Classification System */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology /> Two-Tier Classification System
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#e8f5e9' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Memory sx={{ color: 'success.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Tier 1: ML Classifier
                        </Typography>
                      </Box>
                      <List dense>
                        <ListItem>
                          <ListItemIcon><Speed color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Lightning Fast"
                            secondary="~10ms per email"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Storage color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Local Processing"
                            secondary="No external API calls"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><School color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Random Forest Model"
                            secondary={`${mlStats?.totalSamples || 0} training samples`}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="85% Confidence Threshold"
                            secondary="Uses ML when confident"
                          />
                        </ListItem>
                      </List>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#e3f2fd' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <CloudQueue sx={{ color: 'primary.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Tier 2: LLM Classifier
                        </Typography>
                      </Box>
                      <List dense>
                        <ListItem>
                          <ListItemIcon><Psychology color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="High Accuracy"
                            secondary="Advanced language understanding"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Timeline color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="Detailed Extraction"
                            secondary="Company, position, status"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><DataUsage color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="2-3 seconds per email"
                            secondary="More compute intensive"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><FilterAlt color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="Fallback System"
                            secondary="Used for uncertain cases"
                          />
                        </ListItem>
                      </List>
                    </Paper>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Classification Flow */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Timeline /> Classification Flow
                </Typography>
                
                <Box sx={{ position: 'relative', pl: 4 }}>
                  {[
                    { icon: <Email />, title: 'Email Arrives', desc: 'New email fetched from Gmail', color: 'text.secondary' },
                    { icon: <FilterAlt />, title: 'Prefilter Check', desc: 'Quick regex patterns eliminate obvious non-job emails', color: 'warning.main' },
                    { icon: <Memory />, title: 'ML Classification', desc: 'Random Forest model attempts classification', color: 'success.main' },
                    { icon: <CheckCircle />, title: 'Confidence Check', desc: 'If confidence > 85%, use ML result', color: 'info.main' },
                    { icon: <CloudQueue />, title: 'LLM Fallback', desc: 'Low confidence triggers LLM classification', color: 'primary.main' },
                    { icon: <Storage />, title: 'Database Storage', desc: 'Results stored with deduplication', color: 'text.primary' },
                    { icon: <School />, title: 'Continuous Learning', desc: 'User feedback improves ML model', color: 'secondary.main' }
                  ].map((step, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', mb: 3, position: 'relative' }}>
                      {index < 6 && (
                        <Box sx={{
                          position: 'absolute',
                          left: 12,
                          top: 40,
                          bottom: -20,
                          width: 2,
                          bgcolor: 'divider'
                        }} />
                      )}
                      <Box sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        bgcolor: 'background.paper',
                        border: 2,
                        borderColor: step.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'absolute',
                        left: 0,
                        color: step.color,
                        zIndex: 1
                      }}>
                        {React.cloneElement(step.icon, { fontSize: 'small' })}
                      </Box>
                      <Box sx={{ ml: 5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Step {index + 1}: {step.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {step.desc}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>

            {/* Database Schema */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Storage /> Database Schema
                </Typography>
                
                <Grid container spacing={2}>
                  {[
                    {
                      table: 'jobs',
                      desc: 'Stores classified job applications',
                      fields: ['id', 'company', 'position', 'status', 'applied_date', 'gmail_message_id']
                    },
                    {
                      table: 'email_sync',
                      desc: 'Tracks processed emails',
                      fields: ['gmail_message_id', 'account_email', 'processed_at', 'is_job_related']
                    },
                    {
                      table: 'ml_feedback',
                      desc: 'User corrections for training',
                      fields: ['email_id', 'is_job_related', 'company', 'position', 'confidence']
                    },
                    {
                      table: 'gmail_accounts',
                      desc: 'Multi-account management',
                      fields: ['email', 'refresh_token', 'added_at', 'is_active']
                    }
                  ].map((table) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={table.table}>
                      <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                          {table.table}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          {table.desc}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {table.fields.map(field => (
                            <Chip key={field} label={field} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp /> Performance Metrics
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary" sx={{ fontWeight: 600 }}>
                        200x
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Faster than LLM
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ML: 10ms vs LLM: 2000ms
                      </Typography>
                    </Box>
                  </Grid>
                  
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="success.main" sx={{ fontWeight: 600 }}>
                        {mlStats ? `${(mlStats.accuracy * 100).toFixed(1)}%` : 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        ML Accuracy
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Improves with feedback
                      </Typography>
                    </Box>
                  </Grid>
                  
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="warning.main" sx={{ fontWeight: 600 }}>
                        60-70%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Emails Prefiltered
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reduced processing load
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                {mlStats && mlStats.totalSamples < 100 && (
                  <Alert severity="info" sx={{ mt: 3 }}>
                    <Typography variant="body2">
                      Your ML model currently has {mlStats.totalSamples} training samples. 
                      Continue syncing emails and providing feedback to improve accuracy. 
                      The model needs at least 100 samples to be fully effective.
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>

          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}