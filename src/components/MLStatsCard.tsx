import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  LinearProgress,
  Chip,
  Alert,
  Divider,
  CircularProgress,
  Tooltip,
  IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Psychology,
  Refresh,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Speed,
  TrendingUp,
  School,
  Info,
  Storage
} from '@mui/icons-material';

interface MLStats {
  trained: boolean;
  totalSamples: number;
  jobSamples: number;
  nonJobSamples: number;
  accuracy: number;
  lastTrained: string | null;
  vocabularySize: number;
  modelSize: string;
}

interface MLUsageStats {
  mlClassifications: number;
  llmClassifications: number;
  averageMLConfidence: number;
  averageLLMConfidence: number;
}

export function MLStatsCard() {
  const [stats, setStats] = useState<MLStats | null>(null);
  const [usageStats, setUsageStats] = useState<MLUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await window.electronAPI.ml.getStats();
      if (result.success) {
        setStats(result.stats);
      } else {
        setError(result.error || 'Failed to load ML stats');
      }
    } catch (err: any) {
      console.error('Error loading ML stats:', err);
      setError('Failed to connect to ML classifier');
    } finally {
      setLoading(false);
    }
  };

  const handleRetrain = async () => {
    try {
      setRetraining(true);
      setError(null);
      
      const result = await window.electronAPI.ml.retrain();
      if (result.success) {
        setStats(result.stats);
        // Show success message
      } else {
        setError(result.error || 'Retraining failed');
      }
    } catch (err: any) {
      console.error('Error retraining model:', err);
      setError('Failed to retrain model');
    } finally {
      setRetraining(false);
    }
  };

  const getStatusIcon = () => {
    if (!stats) return <ErrorIcon color="error" />;
    
    if (!stats.trained || stats.totalSamples < 100) {
      return <Warning color="warning" />;
    }
    
    if (stats.accuracy >= 0.85) {
      return <CheckCircle color="success" />;
    }
    
    return <Info color="info" />;
  };

  const getStatusColor = () => {
    if (!stats || !stats.trained) return 'error';
    if (stats.totalSamples < 100) return 'warning';
    if (stats.accuracy >= 0.85) return 'success';
    return 'info';
  };

  const getStatusMessage = () => {
    if (!stats) return 'ML Classifier not initialized';
    if (!stats.trained) return 'Model not trained';
    if (stats.totalSamples < 100) return 'Needs more training data';
    if (stats.accuracy >= 0.9) return 'Excellent performance';
    if (stats.accuracy >= 0.85) return 'Good performance';
    if (stats.accuracy >= 0.75) return 'Fair performance';
    return 'Needs improvement';
  };

  const calculateMLUsageRatio = () => {
    if (!usageStats) return 0;
    const total = usageStats.mlClassifications + usageStats.llmClassifications;
    if (total === 0) return 0;
    return (usageStats.mlClassifications / total) * 100;
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <Psychology fontSize="large" color="primary" />
            <Typography variant="h6">ML Classifier</Typography>
            {getStatusIcon()}
          </Box>
          <Box display="flex" gap={1}>
            <Tooltip title="Refresh stats">
              <IconButton onClick={loadStats} size="small">
                <Refresh />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              onClick={handleRetrain}
              disabled={retraining || !stats || stats.totalSamples < 10}
              startIcon={retraining ? <CircularProgress size={16} /> : <School />}
            >
              {retraining ? 'Retraining...' : 'Retrain Model'}
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box mb={2}>
          <Chip
            label={getStatusMessage()}
            color={getStatusColor() as any}
            size="small"
            sx={{ mb: 1 }}
          />
        </Box>

        {stats && (
          <>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Training Samples
                  </Typography>
                  <Typography variant="h6">
                    {stats.totalSamples.toLocaleString()}
                  </Typography>
                  {stats.totalSamples < 100 && (
                    <Typography variant="caption" color="warning.main">
                      Need at least 100 samples
                    </Typography>
                  )}
                </Box>
              </Grid>
              <Grid size={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Model Accuracy
                  </Typography>
                  <Typography variant="h6">
                    {stats.trained ? `${(stats.accuracy * 100).toFixed(1)}%` : 'N/A'}
                  </Typography>
                  {stats.accuracy > 0 && stats.accuracy < 0.75 && (
                    <Typography variant="caption" color="warning.main">
                      Needs improvement
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Training Data Distribution */}
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Training Data Distribution
              </Typography>
              <Box display="flex" alignItems="center" gap={2}>
                <Box flex={1}>
                  <LinearProgress
                    variant="determinate"
                    value={stats.totalSamples > 0 ? (stats.jobSamples / stats.totalSamples) * 100 : 0}
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" minWidth={100}>
                  {stats.jobSamples} job / {stats.nonJobSamples} non-job
                </Typography>
              </Box>
            </Box>

            {/* Model Details */}
            <Grid container spacing={1}>
              <Grid size={6}>
                <Typography variant="caption" color="text.secondary">
                  Vocabulary Size
                </Typography>
                <Typography variant="body2">
                  {stats.vocabularySize.toLocaleString()} words
                </Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="caption" color="text.secondary">
                  Model Size
                </Typography>
                <Typography variant="body2">
                  {stats.modelSize}
                </Typography>
              </Grid>
              <Grid size={12}>
                <Typography variant="caption" color="text.secondary">
                  Last Trained
                </Typography>
                <Typography variant="body2">
                  {stats.lastTrained 
                    ? new Date(stats.lastTrained).toLocaleString()
                    : 'Never'}
                </Typography>
              </Grid>
            </Grid>

            {/* Performance Comparison */}
            {stats.trained && stats.totalSamples >= 100 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Performance Benefits
                  </Typography>
                  <Grid container spacing={1}>
                    <Grid size={6}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Speed fontSize="small" color="success" />
                        <Typography variant="caption">
                          ~10ms per email (ML)
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={6}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <TrendingUp fontSize="small" color="primary" />
                        <Typography variant="caption">
                          200x faster than LLM
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              </>
            )}

            {/* Training Recommendation */}
            {!stats.trained || stats.totalSamples < 500 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  {!stats.trained 
                    ? 'Sync more emails to start training the ML model'
                    : stats.totalSamples < 100
                    ? `Need ${100 - stats.totalSamples} more samples to enable ML classification`
                    : stats.totalSamples < 500
                    ? 'Continue syncing emails to improve accuracy'
                    : 'Model is ready for use'}
                </Typography>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}