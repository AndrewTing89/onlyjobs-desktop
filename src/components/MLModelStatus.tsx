import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Alert,
  LinearProgress,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Psychology,
  Refresh,
  ModelTraining,
  Computer,
  Storage
} from '@mui/icons-material';

// Type definitions moved to src/types/electron.d.ts

interface MLStatus {
  python_available: boolean;
  python_path?: string;
  model_ready: boolean;
  model_path?: string;
  feature_extractor_ready: boolean;
  initialized: boolean;
  error?: string;
}

const MLModelStatus: React.FC = () => {
  const [status, setStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainDialog, setTrainDialog] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadStatus = async () => {
    try {
      setLoading(true);
      const mlStatus = await window.electronAPI.getMlStatus();
      setStatus(mlStatus);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load ML status:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeML = async () => {
    try {
      setLoading(true);
      await window.electronAPI.initializeMl();
      await loadStatus();
    } catch (error) {
      console.error('Failed to initialize ML:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTraining = async () => {
    try {
      setTraining(true);
      setTrainDialog(false);
      await window.electronAPI.trainModel();
    } catch (error) {
      console.error('Failed to start training:', error);
      setTraining(false);
    }
  };

  useEffect(() => {
    loadStatus();

    // Set up event listeners for training events
    window.electronAPI.onMlTrainingComplete((result) => {
      console.log('ML training completed:', result);
      setTraining(false);
      loadStatus(); // Reload status after training
    });

    window.electronAPI.onMlTrainingError((error) => {
      console.error('ML training error:', error);
      setTraining(false);
    });
  }, []);

  const getStatusIcon = (ready: boolean, error?: string) => {
    if (error) return <Error color="error" />;
    if (ready) return <CheckCircle color="success" />;
    return <Warning color="warning" />;
  };

  const getStatusColor = (ready: boolean, error?: string): 'success' | 'error' | 'warning' => {
    if (error) return 'error';
    if (ready) return 'success';
    return 'warning';
  };

  const getStatusText = (ready: boolean, error?: string) => {
    if (error) return 'Error';
    if (ready) return 'Ready';
    return 'Not Ready';
  };

  const isFullyReady = status && 
    status.python_available && 
    status.model_ready && 
    status.feature_extractor_ready && 
    status.initialized;

  const canTrain = status && status.python_available && status.initialized;

  if (loading && !status) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2}>
            <CircularProgress size={24} />
            <Typography>Loading ML model status...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <Psychology color="primary" />
              <Typography variant="h6">ML Model Status</Typography>
            </Box>
            
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={loadStatus}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
              >
                Refresh
              </Button>
              
              {canTrain && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setTrainDialog(true)}
                  disabled={training}
                  startIcon={training ? <CircularProgress size={16} /> : <ModelTraining />}
                >
                  {training ? 'Training...' : 'Train Model'}
                </Button>
              )}
            </Stack>
          </Box>

          {status?.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {status.error}
            </Alert>
          )}

          {training && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="body2">
                  Training ML model... This may take several minutes.
                </Typography>
                <LinearProgress sx={{ mt: 1 }} />
              </Box>
            </Alert>
          )}

          <Stack spacing={2}>
            {/* Overall Status */}
            <Box>
              <Chip
                icon={getStatusIcon(!!isFullyReady, status?.error)}
                label={`Overall: ${isFullyReady ? 'Ready' : 'Not Ready'}`}
                color={getStatusColor(!!isFullyReady, status?.error)}
                variant="outlined"
                size="small"
              />
            </Box>

            <Divider />

            {/* Component Status */}
            <Stack spacing={1}>
              <Box display="flex" alignItems="center" justifyContent="between">
                <Box display="flex" alignItems="center" gap={1}>
                  <Computer fontSize="small" />
                  <Typography variant="body2">Python Runtime</Typography>
                </Box>
                <Chip
                  icon={getStatusIcon(status?.python_available || false)}
                  label={getStatusText(status?.python_available || false)}
                  color={getStatusColor(status?.python_available || false)}
                  size="small"
                />
              </Box>

              {status?.python_path && (
                <Typography variant="caption" color="textSecondary" ml={3}>
                  Path: {status.python_path}
                </Typography>
              )}

              <Box display="flex" alignItems="center" justifyContent="between">
                <Box display="flex" alignItems="center" gap={1}>
                  <Storage fontSize="small" />
                  <Typography variant="body2">ML Model</Typography>
                </Box>
                <Chip
                  icon={getStatusIcon(status?.model_ready || false)}
                  label={getStatusText(status?.model_ready || false)}
                  color={getStatusColor(status?.model_ready || false)}
                  size="small"
                />
              </Box>

              <Box display="flex" alignItems="center" justifyContent="between">
                <Box display="flex" alignItems="center" gap={1}>
                  <Psychology fontSize="small" />
                  <Typography variant="body2">Feature Extractor</Typography>
                </Box>
                <Chip
                  icon={getStatusIcon(status?.feature_extractor_ready || false)}
                  label={getStatusText(status?.feature_extractor_ready || false)}
                  color={getStatusColor(status?.feature_extractor_ready || false)}
                  size="small"
                />
              </Box>

              <Box display="flex" alignItems="center" justifyContent="between">
                <Box display="flex" alignItems="center" gap={1}>
                  <CheckCircle fontSize="small" />
                  <Typography variant="body2">Initialized</Typography>
                </Box>
                <Chip
                  icon={getStatusIcon(status?.initialized || false)}
                  label={getStatusText(status?.initialized || false)}
                  color={getStatusColor(status?.initialized || false)}
                  size="small"
                />
              </Box>
            </Stack>

            <Divider />

            {/* Actions */}
            <Box>
              {!status?.initialized && status?.python_available && (
                <Button
                  variant="contained"
                  onClick={initializeML}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : <Psychology />}
                  fullWidth
                >
                  Initialize ML System
                </Button>
              )}

              {!status?.python_available && (
                <Alert severity="warning">
                  <Typography variant="body2">
                    Python 3.8+ is required for ML functionality. Please install Python and restart the application.
                  </Typography>
                </Alert>
              )}

              {status?.initialized && !status?.model_ready && (
                <Alert severity="info">
                  <Typography variant="body2">
                    ML models are not trained yet. Click "Train Model" to create the classification models.
                  </Typography>
                </Alert>
              )}
            </Box>

            {/* Last Update */}
            <Typography variant="caption" color="textSecondary" textAlign="center">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Training Confirmation Dialog */}
      <Dialog open={trainDialog} onClose={() => setTrainDialog(false)}>
        <DialogTitle>Train ML Model</DialogTitle>
        <DialogContent>
          <Typography>
            This will train the ML model for email classification. The process may take several minutes 
            and requires internet access to collect training data.
          </Typography>
          <Typography sx={{ mt: 2 }} color="textSecondary">
            Note: This will collect sample emails from public sources to train the model.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrainDialog(false)}>Cancel</Button>
          <Button onClick={startTraining} variant="contained">
            Start Training
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MLModelStatus;