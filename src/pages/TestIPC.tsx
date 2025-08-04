import React, { useState } from 'react';
import { Container, Button, Typography, Paper, Stack, Alert } from '@mui/material';

const TestIPC: React.FC = () => {
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addResult = (result: string) => {
    setResults(prev => [...prev, result]);
  };

  const testOpenExternal = async () => {
    try {
      addResult('Testing openExternal...');
      await window.electronAPI.openExternal('https://www.google.com');
      addResult('✅ openExternal worked!');
    } catch (err) {
      const errorMsg = `❌ openExternal failed: ${err}`;
      addResult(errorMsg);
      setError(errorMsg);
    }
  };

  const testNotification = async () => {
    try {
      addResult('Testing notification...');
      await window.electronAPI.showNotification('Test', 'This is a test notification');
      addResult('✅ notification worked!');
    } catch (err) {
      const errorMsg = `❌ notification failed: ${err}`;
      addResult(errorMsg);
    }
  };

  const testAllHandlers = async () => {
    setResults([]);
    setError(null);
    
    // Test each handler
    await testOpenExternal();
    await testNotification();
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        IPC Handler Test Page
      </Typography>
      
      <Stack spacing={2}>
        <Button variant="contained" onClick={testAllHandlers}>
          Test All IPC Handlers
        </Button>
        
        <Button variant="outlined" onClick={testOpenExternal}>
          Test Open External Only
        </Button>
        
        {error && (
          <Alert severity="error">{error}</Alert>
        )}
        
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Test Results:
          </Typography>
          {results.map((result, index) => (
            <Typography key={index} variant="body2" sx={{ fontFamily: 'monospace' }}>
              {result}
            </Typography>
          ))}
        </Paper>
      </Stack>
    </Container>
  );
};

export default TestIPC;