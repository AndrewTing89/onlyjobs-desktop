import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Refresh,
  Memory,
  Storage,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';

interface LLMHealth {
  status: 'healthy' | 'unhealthy' | 'error' | 'unknown';
  modelPath: string;
  modelExists: boolean;
  modelSize: number;
  expectedSize: number;
  canLoad: boolean;
  error: string | null;
  lastChecked: string;
}

export const LLMHealthCard: React.FC = () => {
  const [health, setHealth] = useState<LLMHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.checkLLMHealth();
      setHealth(result);
    } catch (error) {
      console.error('Failed to check LLM health:', error);
      setHealth({
        status: 'error',
        modelPath: '',
        modelExists: false,
        modelSize: 0,
        expectedSize: 4368439584,
        canLoad: false,
        error: 'Failed to check health',
        lastChecked: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    if (loading) return <CircularProgress size={24} />;
    
    switch (health?.status) {
      case 'healthy':
        return <CheckCircle sx={{ color: 'success.main' }} />;
      case 'unhealthy':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      case 'error':
        return <Warning sx={{ color: 'warning.main' }} />;
      default:
        return <Memory sx={{ color: 'text.secondary' }} />;
    }
  };

  const getStatusColor = () => {
    switch (health?.status) {
      case 'healthy':
        return 'success';
      case 'unhealthy':
        return 'error';
      case 'error':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (!health && !loading) {
    return null;
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {getStatusIcon()}
            <Typography variant="h6">LLM Model Health</Typography>
            <Chip
              size="small"
              label={health?.status || 'checking'}
              color={getStatusColor() as any}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
            <IconButton size="small" onClick={checkHealth} disabled={loading}>
              <Refresh />
            </IconButton>
          </Box>
        </Box>

        {/* Main Status Message */}
        {health?.status === 'healthy' ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            LLM model is working correctly. Email classification is operational.
          </Alert>
        ) : health?.status === 'unhealthy' ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              LLM model is not working. Email classification will fail.
            </Typography>
            {health.error && (
              <Typography variant="body2">
                Error: {health.error}
              </Typography>
            )}
          </Alert>
        ) : null}

        {/* Quick Stats */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Storage fontSize="small" />
              <Typography variant="body2" color="text.secondary">
                Model File
              </Typography>
            </Box>
            <Typography variant="body1">
              {health?.modelExists ? 'Present' : 'Missing'}
            </Typography>
          </Box>
          
          {health?.modelExists && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                File Size
              </Typography>
              <Typography variant="body1">
                {formatBytes(health.modelSize)}
              </Typography>
            </Box>
          )}
          
          <Box>
            <Typography variant="body2" color="text.secondary">
              Can Load
            </Typography>
            <Typography variant="body1">
              {health?.canLoad ? 'Yes' : 'No'}
            </Typography>
          </Box>
        </Box>

        {/* Size Progress Bar (if file exists) */}
        {health?.modelExists && health.modelSize > 0 && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Model Integrity
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round((health.modelSize / health.expectedSize) * 100)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (health.modelSize / health.expectedSize) * 100)}
              color={health.modelSize === health.expectedSize ? 'success' : 'warning'}
            />
            {health.modelSize !== health.expectedSize && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
                Size mismatch: Expected {formatBytes(health.expectedSize)}, got {formatBytes(health.modelSize)}
              </Typography>
            )}
          </Box>
        )}

        {/* Expanded Details */}
        <Collapse in={expanded}>
          <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" gutterBottom>
              Technical Details
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <strong>Model Path:</strong> {health?.modelPath || 'Unknown'}
              </Typography>
              <Typography variant="body2">
                <strong>Expected Model:</strong> Mistral-7B-Instruct-v0.2 (Q4_K_M)
              </Typography>
              <Typography variant="body2">
                <strong>Last Checked:</strong> {health ? new Date(health.lastChecked).toLocaleString() : 'Never'}
              </Typography>
            </Box>

            {/* Fix Instructions */}
            {health?.status === 'unhealthy' && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  How to Fix:
                </Typography>
                <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
                  <li>Download the Mistral-7B model from HuggingFace</li>
                  <li>Place it in the models/ directory as "model.gguf"</li>
                  <li>Ensure the file is exactly {formatBytes(health.expectedSize)}</li>
                  <li>Click refresh to check again</li>
                </ol>
              </Alert>
            )}
          </Box>
        </Collapse>

        {/* Action Buttons */}
        {health?.status === 'unhealthy' && (
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                window.electronAPI.openExternal('https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF');
              }}
            >
              Download Model
            </Button>
            <Button
              variant="outlined"
              onClick={checkHealth}
              disabled={loading}
            >
              Retry Check
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};