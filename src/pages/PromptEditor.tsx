import React, { useState, useEffect } from 'react';
import {
  Box,
  CssBaseline,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  RestartAlt as ResetIcon,
  ContentCopy as CopyIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { useAuth } from '../contexts/ElectronAuthContext';

const DEFAULT_PROMPT = `You are an email parser. Output ONLY JSON matching the schema, with no extra text.
Decide if the email is job-related (job application, recruiting, ATS, interview, offer, rejection, etc.).
If not job-related → is_job_related=false, and company=null, position=null, status=null.
If job-related, extract:
- company: prefer official name from body; map ATS domains (pnc@myworkday.com → PNC).
- position: strip job codes (R196209 Data Analyst → Data Analyst).
- status: Applied | Interview | Declined | Offer; if uncertain use null.
Never use 'unknown' - use null per schema.

Examples:
Input: Subject: Application received – Data Analyst
Body: Thanks for applying to Acme for Data Analyst.
{"is_job_related":true,"company":"Acme","position":"Data Analyst","status":"Applied"}

Input: Subject: Interview – Globex
Body: Schedule interview for your Globex application.
{"is_job_related":true,"company":"Globex","position":null,"status":"Interview"}

Input: Subject: Your application
Body: We regret to inform you we will not move forward at Initech.
{"is_job_related":true,"company":"Initech","position":null,"status":"Declined"}

Input: Subject: Career newsletter
Body: Industry news and career advice.
{"is_job_related":false,"company":null,"position":null,"status":null}`;

export default function PromptEditor() {
  const location = useLocation();
  const { currentUser, signOut } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    try {
      const savedPrompt = await window.electronAPI.prompt.get();
      setPrompt(savedPrompt || DEFAULT_PROMPT);
      setOriginalPrompt(savedPrompt || DEFAULT_PROMPT);
    } catch (error) {
      console.error('Failed to load prompt:', error);
      setPrompt(DEFAULT_PROMPT);
      setOriginalPrompt(DEFAULT_PROMPT);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await window.electronAPI.prompt.save(prompt);
      setOriginalPrompt(prompt);
      setSnackbar({ open: true, message: 'Prompt saved successfully! It will be used for all model classifications.', severity: 'success' });
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setSnackbar({ open: true, message: 'Failed to save prompt', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await window.electronAPI.prompt.reset();
      setPrompt(DEFAULT_PROMPT);
      setOriginalPrompt(DEFAULT_PROMPT);
      setSnackbar({ open: true, message: 'Prompt reset to default', severity: 'info' });
    } catch (error) {
      console.error('Failed to reset prompt:', error);
      setSnackbar({ open: true, message: 'Failed to reset prompt', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setSnackbar({ open: true, message: 'Prompt copied to clipboard', severity: 'info' });
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const hasChanges = prompt !== originalPrompt;

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <CssBaseline />

        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar 
              currentUser={{
                displayName: currentUser?.name || 'User',
                email: currentUser?.email || 'user@example.com'
              }} 
              onLogout={handleLogout}
              title="AI Classification Prompt"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            {/* Header Card */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    Classification Prompt Editor
                  </Typography>
                  <Tooltip title="This prompt will be used by all models when classifying emails">
                    <InfoIcon sx={{ color: 'text.secondary' }} />
                  </Tooltip>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Define how AI models should classify and parse job-related emails. This prompt will be shared across all model testing sub-pages.
                </Typography>
              </CardContent>
            </Card>

            {/* Important Notice */}
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                How This Works
              </Typography>
              <Typography variant="body2">
                • This prompt is used by all models (Qwen, Llama, Phi, Hermes) during email classification<br/>
                • Changes here will affect how emails are classified in all model dashboard sub-pages<br/>
                • The prompt must instruct models to return JSON with: is_job_related, company, position, and status<br/>
                • Include examples to improve accuracy through few-shot learning
              </Typography>
            </Alert>

            {/* Prompt Editor */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">System Prompt</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Copy to clipboard">
                    <IconButton onClick={handleCopy} size="small">
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              
              <TextField
                fullWidth
                multiline
                rows={20}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                variant="outlined"
                placeholder="Enter your classification prompt here..."
                sx={{
                  fontFamily: 'monospace',
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '14px',
                  }
                }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
                <Box>
                  {hasChanges && (
                    <Typography variant="body2" color="warning.main">
                      You have unsaved changes
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<ResetIcon />}
                    onClick={handleReset}
                    disabled={loading}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={loading || !hasChanges}
                  >
                    Save Prompt
                  </Button>
                </Box>
              </Box>
            </Paper>

            {/* JSON Schema Reference */}
            <Paper sx={{ p: 3, backgroundColor: 'grey.50' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Required JSON Output Schema
              </Typography>
              <Box sx={{ backgroundColor: 'grey.100', p: 2, borderRadius: 1, fontFamily: 'monospace' }}>
                <pre style={{ margin: 0, fontSize: '14px' }}>
{`{
  "is_job_related": boolean,
  "company": string | null,
  "position": string | null,
  "status": "Applied" | "Interview" | "Declined" | "Offer" | null
}`}
                </pre>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                All models must return JSON matching this exact schema. Use null for unknown values, never "unknown" or empty strings.
              </Typography>
            </Paper>
          </Box>
        </Box>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            onClose={() => setSnackbar({ ...snackbar, open: false })} 
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}