import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  CardActions,
  Typography, 
  Button,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Science as ScienceIcon,
  Dashboard as DashboardIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { useAuth } from '../contexts/ElectronAuthContext';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';

// Model configurations
const models = [
  {
    id: 'qwen2.5-7b',
    name: 'Qwen2.5-7B',
    description: 'Best overall - 32K context, excellent parsing',
    size: '4.7GB',
    color: '#4CAF50',
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama-3.1-8B',
    description: 'Massive 128K context for few-shot learning',
    size: '4.9GB',
    color: '#2196F3',
  },
  {
    id: 'phi-3.5-mini-128k',
    name: 'Phi-3.5-mini',
    description: 'Small model with huge 128K context window',
    size: '2.4GB',
    color: '#FF9800',
  },
  {
    id: 'hermes-3-llama-8b',
    name: 'Hermes-3-Llama',
    description: 'Function calling specialist - 128K context',
    size: '4.9GB',
    color: '#9C27B0',
  },
  {
    id: 'qwen2.5-3b',
    name: 'Qwen2.5-3B',
    description: 'Fast baseline - 32K context',
    size: '2.1GB',
    color: '#F44336',
  },
];

const ModelTestingPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, signOut } = useAuth();
  const [modelStatuses, setModelStatuses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadModelStatuses();
  }, []);
  
  const loadModelStatuses = async () => {
    try {
      const result = await window.electronAPI.models.getAllModels();
      if (result.success) {
        setModelStatuses(result.statuses || {});
      }
    } catch (error) {
      console.error('Failed to load model statuses:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownloadModel = async (modelId: string) => {
    try {
      await window.electronAPI.models.downloadModel(modelId);
      // Reload statuses after download
      await loadModelStatuses();
    } catch (error) {
      console.error('Failed to download model:', error);
    }
  };
  
  const handleNavigateToModel = (modelId: string) => {
    navigate(`/model-testing/${modelId}`);
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
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
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
              title="Model Testing"
            />
          </Box>
          
          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto' }}>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
                Model Testing Dashboard
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Select a model to test email classification with your Gmail data. Each model will have its own dashboard.
              </Typography>
            </Box>
            
            {/* Info Alert */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                How it works
              </Typography>
              <Typography variant="body2">
                • Download the models you want to test<br/>
                • Click on a model card to open its dashboard<br/>
                • Sync your Gmail emails using that specific model<br/>
                • Compare results across different models<br/>
                • Edit the shared classification prompt in the AI Prompt page
              </Typography>
            </Alert>
            
            {/* Model Cards */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { 
                  xs: '1fr', 
                  md: 'repeat(2, 1fr)', 
                  lg: 'repeat(3, 1fr)' 
                },
                gap: 3 
              }}>
                {models.map((model) => {
                  const status = modelStatuses[model.id];
                  const isReady = status?.status === 'ready';
                  const isDownloading = status?.status === 'downloading';
                  
                  return (
                    <Card 
                      key={model.id}
                      sx={{ 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderTop: `4px solid ${model.color}`,
                      }}
                    >
                      <CardContent sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {model.name}
                            </Typography>
                            {isReady && (
                              <Chip 
                                icon={<CheckCircleIcon />}
                                label="Ready" 
                                color="success" 
                                size="small"
                              />
                            )}
                          </Box>
                          
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {model.description}
                          </Typography>
                          
                          <Typography variant="caption" color="text.secondary">
                            Model size: {model.size}
                          </Typography>
                          
                          {isDownloading && (
                            <Box sx={{ mt: 2 }}>
                              <CircularProgress size={20} />
                              <Typography variant="caption" sx={{ ml: 1 }}>
                                Downloading...
                              </Typography>
                            </Box>
                          )}
                      </CardContent>
                      
                      <CardActions sx={{ p: 2, pt: 0 }}>
                          {isReady ? (
                            <Button
                              fullWidth
                              variant="contained"
                              startIcon={<DashboardIcon />}
                              onClick={() => handleNavigateToModel(model.id)}
                              sx={{ 
                                backgroundColor: model.color,
                                '&:hover': { 
                                  backgroundColor: model.color,
                                  filter: 'brightness(0.9)'
                                }
                              }}
                            >
                              Open Dashboard
                            </Button>
                          ) : (
                            <Button
                              fullWidth
                              variant="outlined"
                              startIcon={<DownloadIcon />}
                              onClick={() => handleDownloadModel(model.id)}
                              disabled={isDownloading}
                            >
                              Download Model
                            </Button>
                          )}
                      </CardActions>
                    </Card>
                  );
                })}
              </Box>
            )}
            
            {/* Comparison View Card */}
            <Card sx={{ mt: 4, borderLeft: '4px solid #666' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ScienceIcon />
                      Model Comparison Lab
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Test individual emails across all models simultaneously
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/model-testing/comparison')}
                  >
                    Open Comparison View
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default ModelTestingPage;