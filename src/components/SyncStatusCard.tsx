import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Box,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import {
  Sync as SyncIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Email as EmailIcon,
  FindInPage as ClassifyIcon,
  Work as JobIcon,
} from '@mui/icons-material';
import { onlyJobsTheme } from '../theme';

export interface SyncStatus {
  isActive: boolean;
  phase: 'idle' | 'fetching' | 'classifying' | 'complete' | 'error';
  progress: number;
  currentBatch?: number;
  totalBatches?: number;
  threadsProcessed: number;
  totalThreads: number;
  jobsFound: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

interface SyncStatusCardProps {
  status: SyncStatus;
}

export default function SyncStatusCard({ status }: SyncStatusCardProps) {
  const getStatusIcon = () => {
    switch (status.phase) {
      case 'fetching':
        return <EmailIcon />;
      case 'classifying':
        return <ClassifyIcon />;
      case 'complete':
        return <CheckIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <SyncIcon />;
    }
  };

  const getStatusColor = () => {
    switch (status.phase) {
      case 'complete':
        return 'success';
      case 'error':
        return 'error';
      case 'idle':
        return 'default';
      default:
        return 'primary';
    }
  };

  const getStatusText = () => {
    switch (status.phase) {
      case 'fetching':
        return 'Fetching emails from Gmail...';
      case 'classifying':
        return `Classifying emails (Batch ${status.currentBatch}/${status.totalBatches})`;
      case 'complete':
        return 'Sync completed successfully';
      case 'error':
        return status.error || 'Sync failed';
      case 'idle':
        return 'Ready to sync';
      default:
        return 'Sync status unknown';
    }
  };

  const calculateElapsedTime = () => {
    if (!status.startTime) return '';
    const endTime = status.endTime || new Date();
    const elapsed = Math.floor((endTime.getTime() - status.startTime.getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculateEstimatedTime = () => {
    if (!status.isActive || status.progress === 0) return '';
    if (!status.startTime) return '';
    
    const elapsed = (new Date().getTime() - status.startTime.getTime()) / 1000;
    const rate = status.threadsProcessed / elapsed;
    const remaining = status.totalThreads - status.threadsProcessed;
    const estimatedSeconds = Math.ceil(remaining / rate);
    
    if (!isFinite(estimatedSeconds)) return '';
    
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    return `~${minutes}:${seconds.toString().padStart(2, '0')} remaining`;
  };

  return (
    <Card 
      sx={{ 
        mb: 2,
        border: status.isActive ? `2px solid ${onlyJobsTheme.palette.primary.main}` : undefined,
        transition: 'all 0.3s ease',
        animation: status.isActive ? 'pulse 2s infinite' : undefined,
        '@keyframes pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(99, 102, 241, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0)' },
        },
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {getStatusIcon()}
            </Box>
            <Typography variant="h6" fontWeight={600}>
              Sync Status
            </Typography>
            <Chip 
              label={status.phase === 'idle' ? 'Idle' : status.phase.charAt(0).toUpperCase() + status.phase.slice(1)}
              color={getStatusColor() as any}
              size="small"
              variant={status.isActive ? 'filled' : 'outlined'}
            />
          </Stack>
          {status.isActive && (
            <Stack direction="row" spacing={1} alignItems="center">
              <ScheduleIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {calculateElapsedTime()}
              </Typography>
              {calculateEstimatedTime() && (
                <Typography variant="body2" color="text.secondary">
                  ({calculateEstimatedTime()})
                </Typography>
              )}
            </Stack>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary" mb={2}>
          {getStatusText()}
        </Typography>

        {(status.isActive || status.phase === 'complete') && (
          <>
            <LinearProgress 
              variant="determinate" 
              value={status.progress} 
              sx={{ mb: 2, height: 8, borderRadius: 4 }}
              color={status.phase === 'complete' ? 'success' : 'primary'}
            />
            
            <Stack 
              direction="row" 
              spacing={3} 
              divider={<Divider orientation="vertical" flexItem />}
              alignItems="center"
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Progress
                </Typography>
                <Typography variant="body1" fontWeight={500}>
                  {Math.round(status.progress)}%
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Threads
                </Typography>
                <Typography variant="body1" fontWeight={500}>
                  {status.threadsProcessed} / {status.totalThreads}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Jobs Found
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <JobIcon fontSize="small" color="primary" />
                  <Typography variant="body1" fontWeight={500} color="primary.main">
                    {status.jobsFound}
                  </Typography>
                </Stack>
              </Box>

              {status.phase === 'classifying' && status.currentBatch && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Batch
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {status.currentBatch} / {status.totalBatches}
                  </Typography>
                </Box>
              )}
            </Stack>
          </>
        )}

        {status.phase === 'complete' && (
          <Box 
            sx={{ 
              mt: 2, 
              p: 1.5, 
              bgcolor: 'success.light',
              borderRadius: 1,
              opacity: 0.1
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckIcon fontSize="small" color="success" />
              <Typography variant="body2" color="success.dark">
                Sync completed successfully! Found {status.jobsFound} job{status.jobsFound !== 1 ? 's' : ''} from {status.threadsProcessed} email threads.
              </Typography>
            </Stack>
          </Box>
        )}

        {status.error && (
          <Box 
            sx={{ 
              mt: 2, 
              p: 1.5, 
              bgcolor: 'error.light',
              borderRadius: 1,
              opacity: 0.1
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <ErrorIcon fontSize="small" color="error" />
              <Typography variant="body2" color="error.dark">
                {status.error}
              </Typography>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}