import React, { useState, useEffect, useRef } from 'react';
import { Box, Paper, Typography, Button } from '@mui/material';
import { Stop as StopIcon, Clear as ClearIcon } from '@mui/icons-material';

export default function SyncConsole() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    // Listen to all sync-related events
    const handleSyncProgress = (data: any) => {
      setIsSyncing(true);
      if (data.status) {
        addLog(`📊 ${data.status}`);
      }
      if (data.stage) {
        addLog(`📊 ${data.stage}`);
      }
      if (data.progress !== undefined) {
        addLog(`⏳ Progress: ${data.progress}%`);
      }
    };

    const handleClassifyProgress = (data: any) => {
      if (data.message) {
        addLog(`🔍 ${data.message}`);
      }
    };

    const handleJobFound = (job: any) => {
      addLog(`✅ Job found: ${job.company} - ${job.position}`);
    };

    const handleSyncComplete = (data: any) => {
      setIsSyncing(false);
      addLog('🎉 Sync completed!');
      if (data.jobsFound !== undefined) {
        addLog(`📈 Total jobs found: ${data.jobsFound}`);
      }
    };

    const handleSyncError = (error: any) => {
      setIsSyncing(false);
      addLog(`❌ Error: ${error.message || 'Sync failed'}`);
    };

    // Subscribe to events
    window.electronAPI.on('sync-progress', handleSyncProgress);
    window.electronAPI.on('classify-progress', handleClassifyProgress);
    window.electronAPI.on('job-found', handleJobFound);
    window.electronAPI.on('sync-complete', handleSyncComplete);
    window.electronAPI.on('sync-error', handleSyncError);

    return () => {
      // Cleanup
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener('sync-progress', handleSyncProgress);
        window.electronAPI.removeListener('classify-progress', handleClassifyProgress);
        window.electronAPI.removeListener('job-found', handleJobFound);
        window.electronAPI.removeListener('sync-complete', handleSyncComplete);
        window.electronAPI.removeListener('sync-error', handleSyncError);
      }
    };
  }, []);

  const handleClear = () => {
    setLogs([]);
  };

  const handleStopSync = async () => {
    if (window.electronAPI?.gmail?.cancelSync) {
      try {
        await window.electronAPI.gmail.cancelSync();
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] 🛑 Sync cancelled by user`]);
        setIsSyncing(false);
      } catch (error) {
        console.error('Failed to cancel sync:', error);
      }
    }
  };

  return (
    <Paper 
      sx={{ 
        p: 2, 
        backgroundColor: '#1e1e1e',
        color: '#00ff00',
        maxHeight: '400px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', color: '#00ff00' }}>
          Sync Console
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isSyncing && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={handleStopSync}
              sx={{ 
                color: '#ff6b6b',
                borderColor: '#ff6b6b',
                '&:hover': {
                  borderColor: '#ff5252',
                  backgroundColor: 'rgba(255, 107, 107, 0.1)'
                }
              }}
            >
              Stop
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            sx={{ 
              color: '#00ff00',
              borderColor: '#00ff00',
              '&:hover': {
                borderColor: '#00cc00',
                backgroundColor: 'rgba(0, 255, 0, 0.1)'
              }
            }}
          >
            Clear
          </Button>
        </Box>
      </Box>
      
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: 1.5,
          backgroundColor: '#0a0a0a',
          p: 1,
          borderRadius: 1,
          border: '1px solid #333',
          minHeight: '200px',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#1e1e1e',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#00ff00',
            borderRadius: '4px',
          },
        }}
      >
        {logs.length === 0 ? (
          <Typography sx={{ color: '#666', fontFamily: 'monospace', fontSize: '12px' }}>
            Waiting for sync activity...
          </Typography>
        ) : (
          logs.map((log, index) => (
            <Box key={index} sx={{ color: '#00ff00', whiteSpace: 'pre-wrap' }}>
              {log}
            </Box>
          ))
        )}
        <div ref={logsEndRef} />
      </Box>
    </Paper>
  );
}