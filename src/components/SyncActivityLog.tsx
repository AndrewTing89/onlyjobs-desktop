import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';

// Simple time formatter to replace date-fns
const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

export interface SyncLogEntry {
  id: string;
  timestamp: Date;
  type: 'fetch' | 'classify' | 'extract' | 'match' | 'job_found' | 'skip' | 'error' | 'batch' | 'stage';
  message: string;
  details?: {
    thread?: string;
    batch?: { current: number; total: number };
    stage?: number;
    result?: 'job' | 'not_job';
    company?: string;
    position?: string;
    timing?: number;
  };
}

interface SyncActivityLogProps {
  entries: SyncLogEntry[];
  maxEntries?: number;
}

const getIcon = (type: SyncLogEntry['type']) => {
  switch (type) {
    case 'fetch': return '📧';
    case 'classify': return '🔍';
    case 'extract': return '📝';
    case 'match': return '🔗';
    case 'job_found': return '✅';
    case 'skip': return '⏭️';
    case 'error': return '❌';
    case 'batch': return '📦';
    case 'stage': return '🎯';
    default: return '•';
  }
};

const getColor = (type: SyncLogEntry['type']) => {
  switch (type) {
    case 'job_found': return 'success';
    case 'skip': return 'default';
    case 'error': return 'error';
    case 'classify': return 'info';
    case 'extract': return 'warning';
    case 'match': return 'secondary';
    default: return 'default';
  }
};

export const SyncActivityLog: React.FC<SyncActivityLogProps> = ({ entries, maxEntries = 15 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const displayEntries = entries.slice(-maxEntries);

  return (
    <Paper 
      sx={{ 
        p: 2, 
        height: '300px',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default'
      }}
    >
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
        Live Classification Activity
      </Typography>
      
      <Box 
        ref={scrollRef}
        sx={{ 
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          pr: 1,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'background.paper',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'divider',
            borderRadius: '4px',
            '&:hover': {
              bgcolor: 'text.disabled',
            },
          },
        }}
      >
        <Stack spacing={1}>
          {displayEntries.map((entry) => (
            <Box
              key={entry.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-child': {
                  borderBottom: 'none',
                },
                animation: 'fadeIn 0.3s ease-in',
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateY(-10px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              <Typography 
                component="span" 
                sx={{ 
                  fontSize: '1.2rem',
                  minWidth: '24px',
                  textAlign: 'center'
                }}
              >
                {getIcon(entry.type)}
              </Typography>
              
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'text.secondary',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem'
                    }}
                  >
                    {formatTime(entry.timestamp)}
                  </Typography>
                  
                  {entry.details?.batch && (
                    <Chip
                      label={`Batch ${entry.details.batch.current}/${entry.details.batch.total}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: '16px', fontSize: '0.7rem' }}
                    />
                  )}
                  
                  {entry.details?.stage && (
                    <Chip
                      label={`Stage ${entry.details.stage}`}
                      size="small"
                      color={entry.details.stage === 1 ? 'info' : entry.details.stage === 2 ? 'warning' : 'secondary'}
                      sx={{ height: '16px', fontSize: '0.7rem' }}
                    />
                  )}
                  
                  {entry.details?.timing && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                      {(entry.details.timing / 1000).toFixed(1)}s
                    </Typography>
                  )}
                </Box>
                
                <Typography 
                  variant="body2" 
                  sx={{ 
                    wordBreak: 'break-word',
                    color: entry.type === 'error' ? 'error.main' : 
                           entry.type === 'job_found' ? 'success.main' : 
                           'text.primary'
                  }}
                >
                  {entry.message}
                </Typography>
                
                {entry.details?.company && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {entry.details.company} - {entry.details.position || 'Unknown Position'}
                  </Typography>
                )}
              </Box>
              
              {entry.details?.result && (
                <Chip
                  label={entry.details.result === 'job' ? 'JOB' : 'SKIP'}
                  size="small"
                  color={entry.details.result === 'job' ? 'success' : 'default'}
                  sx={{ 
                    minWidth: '45px',
                    height: '20px',
                    fontSize: '0.65rem',
                    fontWeight: 600
                  }}
                />
              )}
            </Box>
          ))}
        </Stack>
      </Box>
      
      {entries.length === 0 && (
        <Box 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'text.secondary'
          }}
        >
          <Typography variant="body2">
            Waiting for sync to start...
          </Typography>
        </Box>
      )}
    </Paper>
  );
};