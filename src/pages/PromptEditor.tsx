import React from 'react';
import {
  Box,
  CssBaseline,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  Paper,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  ArrowForward as ArrowForwardIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { useAuth } from '../contexts/ElectronAuthContext';

export default function PromptEditor() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const models = [
    { id: 'llama-3-8b-instruct-q5_k_m', name: 'Llama-3-8B-Instruct', description: 'Balanced performance - Q5_K_M quantization', color: '#2196F3' },
    { id: 'qwen2.5-7b-instruct-q5_k_m', name: 'Qwen2.5-7B-Instruct', description: 'Latest Qwen model - Q5_K_M quantization', color: '#4CAF50' },
    { id: 'hermes-2-pro-mistral-7b-q5_k_m', name: 'Hermes-2-Pro-Mistral-7B', description: 'Function calling specialist - Q5_K_M', color: '#9C27B0' },
  ];

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
              title="AI Prompt Configuration"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            {/* Header Card */}
            <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent sx={{ color: 'white' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <PsychologyIcon sx={{ fontSize: 40 }} />
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    Model-Specific Prompt Configuration
                  </Typography>
                </Box>
                <Typography variant="body1">
                  Each model now has its own customizable three-stage prompts. Choose a model below to configure its 
                  Stage 1 (classification), Stage 2 (extraction), and Stage 3 (job matching) prompts.
                </Typography>
              </CardContent>
            </Card>

            {/* Important Notice */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Three-Stage Email Processing System
              </Typography>
              <Typography variant="body2">
                • <strong>Stage 1: Classification</strong> - Fast binary check: Is this email job-related? (Yes/No)<br/>
                • <strong>Stage 2: Extraction</strong> - Extract company, position, and status from job emails<br/>
                • <strong>Stage 3: Job Matching</strong> - Determine if two job emails refer to the same position<br/>
                • <strong>Smart Processing:</strong> Non-job emails exit after Stage 1 (saves ~30% processing time)<br/>
                • <strong>Thread Awareness:</strong> Gmail threads are processed as one job (70-80% fewer LLM calls)
              </Typography>
            </Alert>

            {/* Model Cards */}
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Select a Model to Configure Prompts
            </Typography>
            
            <Grid container spacing={3}>
              {models.map((model) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={model.id}>
                  <Paper 
                    sx={{ 
                      p: 3, 
                      height: '100%',
                      borderTop: `4px solid ${model.color}`,
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      cursor: 'pointer',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 3,
                      }
                    }}
                    onClick={() => navigate(`/models/${model.id}`)}
                  >
                    <Typography variant="h6" sx={{ mb: 1, color: model.color, fontWeight: 600 }}>
                      {model.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {model.description}
                    </Typography>
                    <Button
                      fullWidth
                      variant="outlined"
                      endIcon={<ArrowForwardIcon />}
                      sx={{ borderColor: model.color, color: model.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/models/${model.id}`);
                      }}
                    >
                      Configure Prompts
                    </Button>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* How It Works */}
            <Card sx={{ mt: 4, bgcolor: 'grey.50' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  How the Two-Stage System Works
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }}>
                        Stage 1: Classification (1.5s)
                      </Typography>
                      <Typography variant="body2">
                        • Determines if email is job-related<br/>
                        • Returns simple yes/no decision<br/>
                        • Optimized for speed<br/>
                        • Non-job emails stop here
                      </Typography>
                    </Paper>
                  </Grid>
                  
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'secondary.main' }}>
                        Stage 2: Extraction (2s)
                      </Typography>
                      <Typography variant="body2">
                        • Only runs for job emails<br/>
                        • Extracts company name<br/>
                        • Identifies position title<br/>
                        • Determines application status
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
                
                <Alert severity="success" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Performance Benefit:</strong> By using two stages, non-job emails (70% of total) are processed 
                    in just 1.5 seconds instead of 3.5 seconds, resulting in 30% faster overall processing.
                  </Typography>
                </Alert>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}