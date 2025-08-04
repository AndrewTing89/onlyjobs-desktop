import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Sync,
  CheckCircle,
  ErrorOutline,
  PlayArrow,
  Schedule,
  CloudDone,
  Info,
  Refresh,
} from '@mui/icons-material';
import { useGmailSync } from '../hooks/useGmailSync';

const accent = '#FF7043';
const white = '#fff';
const textColor = '#202020';
const successColor = '#4caf50';
const warningColor = '#ff9800';
const errorColor = '#f44336';

interface SyncStatusProps {
  isConnected: boolean;
  compact?: boolean;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ 
  isConnected, 
  compact = false 
}) => {
  const { isSyncing, lastSync, error, progress, startSync } = useGmailSync();

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getSyncStatus = () => {
    if (!isConnected) {
      return {
        color: '#666',
        label: 'Not Connected',
        icon: <ErrorOutline />,
      };
    }
    
    if (isSyncing) {
      return {
        color: accent,
        label: 'Syncing...',
        icon: <Sync className="spin" />,
      };
    }
    
    if (error) {
      return {
        color: errorColor,
        label: 'Sync Error',
        icon: <ErrorOutline />,
      };
    }
    
    if (lastSync) {
      return {
        color: successColor,
        label: 'Up to Date',
        icon: <CheckCircle />,
      };
    }
    
    return {
      color: warningColor,
      label: 'Pending',
      icon: <Schedule />,
    };
  };

  const status = getSyncStatus();

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          icon={status.icon}
          label={status.label}
          size="small"
          sx={{
            bgcolor: `${status.color}20`,
            color: status.color,
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: status.color,
            },
          }}
        />
        {isConnected && (
          <Tooltip title="Sync now">
            <IconButton
              size="small"
              onClick={startSync}
              disabled={isSyncing}
              sx={{ color: accent }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  }

  return (
    <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1 }}>
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <CloudDone sx={{ color: accent, mr: 2 }} />
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
            Email Sync Status
          </Typography>
        </Box>

        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 3, borderRadius: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={startSync}
                disabled={isSyncing}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {React.cloneElement(status.icon, { 
              sx: { color: status.color, fontSize: 20 }
            })}
            <Typography variant="body1" sx={{ color: textColor, fontWeight: 500 }}>
              {status.label}
            </Typography>
          </Box>
          
          <Typography variant="body2" sx={{ color: '#666' }}>
            Last sync: {formatLastSync(lastSync)}
          </Typography>
        </Box>

        {isSyncing && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" sx={{ color: textColor }}>
                Processing emails...
              </Typography>
              <Typography variant="body2" sx={{ color: '#666' }}>
                {progress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: `${accent}20`,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: accent,
                },
              }}
            />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            onClick={startSync}
            disabled={!isConnected || isSyncing}
            startIcon={isSyncing ? <Sync className="spin" /> : <PlayArrow />}
            sx={{
              bgcolor: accent,
              borderRadius: 2,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: accent,
                boxShadow: '0 4px 12px rgba(255, 112, 67, 0.3)',
              },
              '&:disabled': {
                bgcolor: '#ccc',
              },
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>

          <Tooltip title="Manual sync will check for new emails and process them immediately">
            <IconButton size="small" sx={{ color: '#666' }}>
              <Info fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {isConnected && (
          <Box sx={{ 
            mt: 3, 
            pt: 3, 
            borderTop: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="body2" sx={{ color: '#666' }}>
              Automatic sync every 15 minutes
            </Typography>
            <Chip
              label="Connected"
              size="small"
              sx={{
                bgcolor: `${successColor}20`,
                color: successColor,
                fontWeight: 500,
              }}
            />
          </Box>
        )}
      </CardContent>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Card>
  );
};