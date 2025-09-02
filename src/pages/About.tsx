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
                  using a Human-in-the-Loop workflow with ML classification, human review, and LLM extraction.
                </Typography>
              </CardContent>
            </Card>

            {/* Classification System */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology /> Human-in-the-Loop Classification System
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#fff3e0' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Email sx={{ color: 'warning.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Page 1: Fetch & Classify
                        </Typography>
                      </Box>
                      <List dense>
                        <ListItem>
                          <ListItemIcon><Speed color="warning" /></ListItemIcon>
                          <ListItemText 
                            primary="Ultra-Fast ML Classification"
                            secondary="~1-2ms per email (Random Forest)"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><FilterAlt color="warning" /></ListItemIcon>
                          <ListItemText 
                            primary="Digest Filter"
                            secondary="Remove newsletters, job boards"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><TrendingUp color="warning" /></ListItemIcon>
                          <ListItemText 
                            primary="95% Accuracy"
                            secondary="Continuously learning from feedback"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Timeline color="warning" /></ListItemIcon>
                          <ListItemText 
                            primary="Automatic Processing"
                            secondary="No manual intervention needed"
                          />
                        </ListItem>
                      </List>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#e8f5e9' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <CheckCircle sx={{ color: 'success.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Page 2: Review Classifications
                        </Typography>
                      </Box>
                      <List dense>
                        <ListItem>
                          <ListItemIcon><Psychology color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Review Classifications"
                            secondary="Verify AI-identified job emails"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><School color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Training Data Collection"
                            secondary="Corrections improve models"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Timeline color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Confidence Indicators"
                            secondary="Visual cues for uncertainty"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><DataUsage color="success" /></ListItemIcon>
                          <ListItemText 
                            primary="Bulk Operations"
                            secondary="Efficient batch processing"
                          />
                        </ListItem>
                      </List>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#e3f2fd' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <CloudQueue sx={{ color: 'primary.main' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Page 3: Extract with LLM
                        </Typography>
                      </Box>
                      <List dense>
                        <ListItem>
                          <ListItemIcon><Psychology color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="LLM Extraction"
                            secondary="~1-2s per approved email only"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Timeline color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="Detailed Parsing"
                            secondary="Company, position, status"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><Memory color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="Smart Job Matching"
                            secondary="Detects and merges duplicates"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemIcon><FilterAlt color="primary" /></ListItemIcon>
                          <ListItemText 
                            primary="Thread-Aware"
                            secondary="Groups emails by conversation"
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
                  <Timeline /> Human-in-the-Loop Workflow
                </Typography>
                
                <Box sx={{ position: 'relative', pl: 4 }}>
                  {[
                    { icon: <Email />, title: 'Fetch Emails', desc: 'Connect Gmail accounts and sync emails', color: 'text.secondary' },
                    { icon: <FilterAlt />, title: 'Digest Filter', desc: 'Remove newsletters, job boards, and spam', color: 'secondary.main' },
                    { icon: <Memory />, title: 'ML Classification', desc: 'Ultra-fast ML classification (~1-2ms) identifies job emails', color: 'warning.main' },
                    { icon: <CheckCircle />, title: 'Human Review', desc: 'User verifies and corrects ML classifications', color: 'info.main' },
                    { icon: <CloudQueue />, title: 'LLM Extraction', desc: 'Extract job details from approved emails (~1-2s)', color: 'primary.main' },
                    { icon: <Storage />, title: 'Database Storage', desc: 'Store jobs with deduplication and thread grouping', color: 'text.primary' },
                    { icon: <School />, title: 'Continuous Learning', desc: 'User feedback improves ML model accuracy', color: 'success.main' }
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
            <Card>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Storage /> Database Schema
                </Typography>
                
                <Grid container spacing={2}>
                  {[
                    {
                      table: 'jobs',
                      desc: 'Main job applications table with HIL status',
                      fields: ['id', 'company', 'position', 'status', 'thread_id', 'email_thread_ids', 'classification_status', 'parse_status']
                    },
                    {
                      table: 'gmail_accounts',
                      desc: 'Multi-account OAuth management',
                      fields: ['email', 'access_token', 'refresh_token', 'last_sync', 'is_active']
                    },
                    {
                      table: 'email_sync',
                      desc: 'Tracks all processed emails',
                      fields: ['gmail_message_id', 'account_email', 'processed_at', 'is_job_related']
                    },
                    {
                      table: 'email_pipeline',
                      desc: 'Central hub tracking emails through workflow',
                      fields: ['gmail_message_id', 'pipeline_stage', 'ml_classification', 'job_probability', 'needs_review', 'user_classification']
                    },
                    {
                      table: 'training_feedback',
                      desc: 'User corrections for ML training',
                      fields: ['gmail_message_id', 'ml_predicted_label', 'human_label', 'correction_reason', 'feature_hash']
                    },
                    {
                      table: 'llm_cache',
                      desc: 'Caches LLM results (7-day TTL)',
                      fields: ['input_hash', 'stage', 'model_name', 'result', 'expires_at']
                    },
                    {
                      table: 'model_prompts',
                      desc: 'Custom prompts per model/stage',
                      fields: ['model_name', 'stage', 'prompt_text', 'is_active']
                    },
                    {
                      table: 'sync_status',
                      desc: 'Global sync statistics',
                      fields: ['last_fetch_time', 'total_emails_fetched', 'total_jobs_found']
                    },
                    {
                      table: 'sync_history',
                      desc: 'Historical sync logs',
                      fields: ['sync_date', 'accounts_synced', 'emails_fetched', 'jobs_found', 'duration_ms']
                    }
                  ].map((table) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={table.table}>
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

          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}