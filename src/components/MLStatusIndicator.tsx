import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Tooltip,
  Typography,
  CircularProgress,
  keyframes
} from '@mui/material';
import {
  Psychology,
  Memory,
  Speed,
  CloudQueue
} from '@mui/icons-material';

interface ClassificationStatus {
  isActive: boolean;
  type: 'ml' | 'llm' | 'idle';
  confidence?: number;
  message?: string;
}

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(255, 112, 67, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 112, 67, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 112, 67, 0);
  }
`;

export function MLStatusIndicator() {
  const [status, setStatus] = useState<ClassificationStatus>({
    isActive: false,
    type: 'idle'
  });
  const [stats, setStats] = useState({
    mlToday: 0,
    llmToday: 0,
    avgConfidence: 0
  });

  useEffect(() => {
    // Listen for classification events
    const handleClassificationStart = (event: any) => {
      setStatus({
        isActive: true,
        type: event.detail?.type || 'llm',
        message: 'Classifying email...'
      });
    };

    const handleClassificationEnd = (event: any) => {
      const { type, confidence } = event.detail || {};
      setStatus({
        isActive: false,
        type: type || 'idle',
        confidence: confidence,
        message: type === 'ml' ? 'ML classified' : 'LLM classified'
      });

      // Update stats
      setStats(prev => ({
        ...prev,
        [type === 'ml' ? 'mlToday' : 'llmToday']: prev[type === 'ml' ? 'mlToday' : 'llmToday'] + 1,
        avgConfidence: confidence ? (prev.avgConfidence + confidence) / 2 : prev.avgConfidence
      }));

      // Clear message after 3 seconds
      setTimeout(() => {
        setStatus(prev => ({ ...prev, message: undefined }));
      }, 3000);
    };

    // Add event listeners
    window.addEventListener('classification-start', handleClassificationStart);
    window.addEventListener('classification-end', handleClassificationEnd);

    // Load initial stats
    loadStats();

    return () => {
      window.removeEventListener('classification-start', handleClassificationStart);
      window.removeEventListener('classification-end', handleClassificationEnd);
    };
  }, []);

  const loadStats = async () => {
    try {
      if (window.electronAPI?.ml?.getStats) {
        const result = await window.electronAPI.ml.getStats();
        if (result.success && result.stats) {
          // Calculate today's stats from the ML model
          setStats({
            mlToday: result.stats.totalSamples || 0,
            llmToday: 0, // This would need to be tracked separately
            avgConfidence: result.stats.accuracy || 0
          });
        }
      }
    } catch (error) {
      console.error('Error loading ML stats:', error);
    }
  };

  const getStatusColor = () => {
    if (!status.isActive && status.type === 'idle') return 'default';
    if (status.type === 'ml') return 'success';
    if (status.type === 'llm') return 'primary';
    return 'default';
  };

  const getStatusIcon = () => {
    if (status.type === 'ml') return <Memory fontSize="small" />;
    if (status.type === 'llm') return <CloudQueue fontSize="small" />;
    return <Speed fontSize="small" />;
  };

  const getStatusLabel = () => {
    if (status.message) return status.message;
    if (status.isActive) {
      return status.type === 'ml' ? 'ML Processing...' : 'LLM Processing...';
    }
    if (stats.mlToday > 0 || stats.llmToday > 0) {
      return `ML: ${stats.mlToday} | LLM: ${stats.llmToday}`;
    }
    return 'Classifier Ready';
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Tooltip 
        title={
          <Box>
            <Typography variant="caption" display="block">
              <strong>Classification Engine Status</strong>
            </Typography>
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              ML Classifications Today: {stats.mlToday}
            </Typography>
            <Typography variant="caption" display="block">
              LLM Classifications Today: {stats.llmToday}
            </Typography>
            {stats.avgConfidence > 0 && (
              <Typography variant="caption" display="block">
                Average Confidence: {(stats.avgConfidence * 100).toFixed(1)}%
              </Typography>
            )}
            <Typography variant="caption" display="block" sx={{ mt: 1, fontSize: '0.7rem' }}>
              ML: Fast local processing (~10ms)<br/>
              LLM: Accurate but slower (~2-3s)
            </Typography>
          </Box>
        }
      >
        <Chip
          icon={status.isActive ? <CircularProgress size={16} color="inherit" /> : getStatusIcon()}
          label={getStatusLabel()}
          color={getStatusColor() as any}
          size="small"
          sx={{
            animation: status.isActive ? `${pulse} 2s infinite` : 'none',
            transition: 'all 0.3s ease',
            '& .MuiChip-icon': {
              transition: 'transform 0.3s ease',
              transform: status.isActive ? 'rotate(360deg)' : 'none'
            }
          }}
        />
      </Tooltip>

      {status.confidence !== undefined && status.confidence < 0.7 && (
        <Tooltip title="Low confidence - needs review">
          <Chip
            label={`${(status.confidence * 100).toFixed(0)}%`}
            color="warning"
            size="small"
            variant="outlined"
          />
        </Tooltip>
      )}
    </Box>
  );
}