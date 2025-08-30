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
  type: 'fetch' | 'classify' | 'extract' | 'match' | 'job_found' | 'skip' | 'error' | 'batch' | 'stage' | 'ml' | 'parse' | 'database';
  message: string;
  details?: {
    thread?: string;
    batch?: { current: number; total: number };
    stage?: number;
    result?: 'job' | 'not_job';
    company?: string;
    position?: string;
    timing?: number;
    confidence?: number;
    isJob?: boolean;
    emailCount?: number;
    duration?: number;
    batchNum?: number;
    totalBatches?: number;
    emailsInBatch?: number;
    emailsSaved?: number;
    jobsFound?: number;
    needsReview?: number;
    totalEmails?: number;
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
    case 'ml': return '📊';
    case 'parse': return '📝';
    case 'database': return '💾';
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
    case 'parse': return 'info';
    case 'database': return 'primary';
    case 'fetch': return 'secondary';
    case 'ml': return 'warning';
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
        height: '400px',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#1e1e1e',
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, color: '#888' }}>
        Live Classification Activity
      </Typography>
      
      <Box 
        ref={scrollRef}
        sx={{ 
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '12px',
          lineHeight: '1.4',
          color: '#d4d4d4',
          bgcolor: '#1e1e1e',
          p: 1,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: '#2e2e2e',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: '#4e4e4e',
            borderRadius: '4px',
            '&:hover': {
              bgcolor: '#5e5e5e',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {displayEntries.map((entry) => {
            // Format ML classification log entries in console style
            if (entry.type === 'ml' && entry.details) {
              const isJob = entry.details.isJob;
              const confidence = entry.details.confidence;
              const timing = entry.details.timing;
              
              return (
                <Box
                  key={entry.id}
                  sx={{
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    color: isJob ? '#4ec9b0' : '#ce9178',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  {getIcon(entry.type)} ML Classification completed in {timing}ms - Job: {isJob ? 'true' : 'false'} (confidence: {confidence?.toFixed(2)})
                </Box>
              );
            }
            
            // Format other entries in a simpler console style
            return (
              <Box
                key={entry.id}
                sx={{
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: entry.type === 'error' ? '#f48771' : 
                         entry.type === 'job_found' ? '#4ec9b0' : 
                         entry.type === 'skip' ? '#808080' :
                         '#d4d4d4',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.05)'
                  }
                }}
              >
                {getIcon(entry.type)} {entry.message}
                {entry.details?.timing && ` (${(entry.details.timing / 1000).toFixed(1)}s)`}
              </Box>
            );
          })}
        </Box>
      </Box>
      
      {entries.length === 0 && (
        <Box 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#808080',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '12px'
          }}
        >
          Waiting for sync to start...
        </Box>
      )}
    </Paper>
  );
};