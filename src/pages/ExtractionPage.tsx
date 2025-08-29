import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Paper,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Alert,
  Snackbar,
  Divider,
  Stack,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Tooltip,
  Stepper,
  Step,
  StepLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Search,
  Refresh,
  PlayArrow,
  Stop,
  CheckCircle,
  Error as ErrorIcon,
  Pending,
  Edit,
  Clear,
  Save,
  ArrowBack,
  Dashboard,
  SkipNext,
  SelectAll,
  IndeterminateCheckBox,
  Psychology,
  Speed,
  Timer,
  Business,
  Work,
  CalendarToday,
  Email
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import custom components
import { LoadingSpinner } from '../components/LoadingSpinner';
import ConfidenceIndicator from '../components/ConfidenceIndicator';

// Import types
import type { EmailClassification } from '../types/classification';

// Import auth context
import { useAuth } from '../contexts/ElectronAuthContext';

const accent = "#FF7043";

const workflowSteps = [
  {
    label: 'Fetch Emails',
    description: 'Connect Gmail accounts and fetch emails for processing',
    active: false
  },
  {
    label: 'Review Classifications',
    description: 'Review AI classifications and mark job-related emails',
    active: false
  },
  {
    label: 'Extract Job Details',
    description: 'Parse job details from confirmed job emails',
    active: true
  }
];

// Available models for extraction
const availableModels = [
  {
    id: 'llama-3.2-3b-instruct-q5_k_m',
    name: 'Llama-3.2-3B-Instruct',
    description: 'Fast 3B model - Q5_K_M quantization',
    size: '2.1GB',
    color: '#2196F3'
  },
  {
    id: 'llama-3-8b-instruct-q5_k_m',
    name: 'Llama-3-8B-Instruct', 
    description: 'Balanced performance - Q5_K_M quantization',
    size: '5.5GB',
    color: '#1976D2'
  },
  {
    id: 'qwen2.5-3b-instruct-q5_k_m',
    name: 'Qwen2.5-3B-Instruct',
    description: 'Efficient 3B Qwen model - Q5_K_M quantization',
    size: '2.0GB', 
    color: '#4CAF50'
  },
  {
    id: 'qwen2.5-7b-instruct-q5_k_m',
    name: 'Qwen2.5-7B-Instruct',
    description: 'Latest Qwen model - Q5_K_M quantization',
    size: '5.1GB',
    color: '#388E3C'
  },
  {
    id: 'phi-3.5-mini-instruct-q5_k_m',
    name: 'Phi-3.5-mini-instruct',
    description: 'Microsoft Phi-3.5 mini (3.8B) - Q5_K_M quantization',
    size: '2.5GB',
    color: '#FF9800'
  },
  {
    id: 'hermes-2-pro-mistral-7b-q5_k_m',
    name: 'Hermes-2-Pro-Mistral-7B',
    description: 'Function calling specialist - Q5_K_M',
    size: '4.8GB',
    color: '#9C27B0'
  },
  {
    id: 'gemma-2-2b-it-q5_k_m',
    name: 'Gemma-2-2B-it',
    description: 'Google Gemma-2 2B instruction tuned - Q5_K_M quantization',
    size: '1.5GB',
    color: '#F44336'
  }
];

interface ExtractionResult {
  id: string;
  email_id: string;
  company?: string;
  position?: string;
  status?: 'Applied' | 'Interview' | 'Offer' | 'Declined';
  confidence?: number;
  extraction_status: 'pending' | 'parsing' | 'completed' | 'failed';
  error_message?: string;
  extracted_at?: string;
}

interface ExtractionProgress {
  current: number;
  total: number;
  currentEmail?: EmailClassification;
  speed: number; // emails per minute
  estimatedTimeRemaining: number; // seconds
  isRunning: boolean;
}

interface EditDialogData {
  email: EmailClassification;
  result: ExtractionResult;
}

export default function ExtractionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const authData = useAuth() as any;
  const currentUser = authData.currentUser;

  // State management
  const [emails, setEmails] = useState<EmailClassification[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(availableModels[0].id);
  const [extractionResults, setExtractionResults] = useState<Record<string, ExtractionResult>>({});
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ExtractionProgress>({
    current: 0,
    total: 0,
    speed: 0,
    estimatedTimeRemaining: 0,
    isRunning: false
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [editDialog, setEditDialog] = useState<EditDialogData | null>(null);
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: '', 
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });
  
  // Prompt management state
  const [customPrompt, setCustomPrompt] = useState('');
  const [isPromptModified, setIsPromptModified] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState(`Extract the following information from this job application email:
- Company name
- Job position/title
- Application status (Applied, Interview, Offer, Rejected)
- Application date
- Any additional relevant details

Format the response as JSON.`);

  // Load confirmed job emails ready for extraction
  useEffect(() => {
    loadJobEmails();
  }, []);

  const loadJobEmails = async () => {
    try {
      setLoading(true);
      
      // Mock data - in real implementation this would load confirmed job emails
      const mockEmails: EmailClassification[] = [
        {
          id: '1',
          email_id: 'email_1',
          from_address: 'noreply@google.com',
          subject: 'Application received for Software Engineer position',
          received_date: new Date(Date.now() - 86400000).toISOString(),
          account_email: 'user@example.com',
          thread_id: 'thread_1',
          ml_confidence: 95,
          is_job_related: true,
          review_status: 'approved',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: '2',
          email_id: 'email_2',
          from_address: 'careers@microsoft.com',
          subject: 'Interview invitation - Senior Developer Role',
          received_date: new Date(Date.now() - 172800000).toISOString(),
          account_email: 'user@example.com',
          ml_confidence: 87,
          is_job_related: true,
          review_status: 'approved',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: '3',
          email_id: 'email_3',
          from_address: 'jobs@apple.com',
          subject: 'Thank you for your application to Apple',
          received_date: new Date(Date.now() - 259200000).toISOString(),
          account_email: 'user@example.com',
          ml_confidence: 78,
          is_job_related: true,
          review_status: 'approved',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      setEmails(mockEmails);
      
      // Initialize extraction results
      const results: Record<string, ExtractionResult> = {};
      mockEmails.forEach(email => {
        results[email.id] = {
          id: email.id,
          email_id: email.email_id,
          extraction_status: 'pending'
        };
      });
      setExtractionResults(results);
      
    } catch (error) {
      console.error('Error loading job emails:', error);
      showSnackbar('Failed to load job emails', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmails = useMemo(() => {
    let filtered = emails;

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(email => 
        email.subject.toLowerCase().includes(query) ||
        email.from_address.toLowerCase().includes(query) ||
        email.company?.toLowerCase().includes(query) ||
        email.position?.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => 
      new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
    );
  }, [emails, searchQuery]);

  const selectedModelInfo = availableModels.find(m => m.id === selectedModel) || availableModels[0];

  const completedExtractions = Object.values(extractionResults).filter(r => r.extraction_status === 'completed');
  const failedExtractions = Object.values(extractionResults).filter(r => r.extraction_status === 'failed');
  const pendingExtractions = Object.values(extractionResults).filter(r => r.extraction_status === 'pending');

  const handleModelChange = (modelId: string) => {
    if (!progress.isRunning) {
      setSelectedModel(modelId);
    }
  };

  const handleSelectAll = () => {
    setSelectedEmails(filteredEmails.map(email => email.id));
  };

  const handleDeselectAll = () => {
    setSelectedEmails([]);
  };

  const handleEmailSelect = (emailId: string, selected: boolean) => {
    if (selected) {
      setSelectedEmails(prev => [...prev, emailId]);
    } else {
      setSelectedEmails(prev => prev.filter(id => id !== emailId));
    }
  };

  const startExtraction = async (emailIds: string[]) => {
    try {
      setProgress(prev => ({ ...prev, isRunning: true, current: 0, total: emailIds.length }));
      
      for (let i = 0; i < emailIds.length; i++) {
        const emailId = emailIds[i];
        const email = emails.find(e => e.id === emailId);
        
        if (!email) continue;
        
        // Update current progress
        setProgress(prev => ({
          ...prev,
          current: i + 1,
          currentEmail: email
        }));

        // Update extraction status to parsing
        setExtractionResults(prev => ({
          ...prev,
          [emailId]: {
            ...prev[emailId],
            extraction_status: 'parsing'
          }
        }));

        // Simulate extraction process
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

        // Mock extraction result
        const mockResult: ExtractionResult = {
          id: emailId,
          email_id: email.email_id,
          company: email.from_address.includes('google') ? 'Google' :
                   email.from_address.includes('microsoft') ? 'Microsoft' :
                   email.from_address.includes('apple') ? 'Apple' :
                   'Unknown Company',
          position: email.subject.includes('Software Engineer') ? 'Software Engineer' :
                   email.subject.includes('Senior Developer') ? 'Senior Developer' :
                   'Unknown Position',
          status: email.subject.toLowerCase().includes('interview') ? 'Interview' : 'Applied',
          confidence: 80 + Math.random() * 20,
          extraction_status: Math.random() > 0.1 ? 'completed' : 'failed',
          error_message: Math.random() > 0.1 ? undefined : 'Failed to parse email content',
          extracted_at: new Date().toISOString()
        };

        // Update extraction result
        setExtractionResults(prev => ({
          ...prev,
          [emailId]: mockResult
        }));

        // Update speed calculation
        const timeElapsed = (i + 1) * 3; // rough estimate
        const speed = ((i + 1) / timeElapsed) * 60; // emails per minute
        const remaining = emailIds.length - (i + 1);
        const eta = remaining > 0 ? (remaining / speed) * 60 : 0;

        setProgress(prev => ({
          ...prev,
          speed: Math.round(speed),
          estimatedTimeRemaining: Math.round(eta)
        }));
      }

      setProgress(prev => ({ ...prev, isRunning: false, currentEmail: undefined }));
      showSnackbar(`Completed extraction for ${emailIds.length} emails`, 'success');
      
    } catch (error) {
      console.error('Extraction failed:', error);
      setProgress(prev => ({ ...prev, isRunning: false }));
      showSnackbar('Extraction failed', 'error');
    }
  };

  const stopExtraction = () => {
    setProgress(prev => ({ ...prev, isRunning: false }));
    showSnackbar('Extraction stopped', 'info');
  };

  const clearCompleted = () => {
    setExtractionResults(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        if (updated[id].extraction_status === 'completed') {
          updated[id] = {
            id,
            email_id: updated[id].email_id,
            extraction_status: 'pending'
          };
        }
      });
      return updated;
    });
    showSnackbar('Cleared completed extractions', 'info');
  };

  const handleEdit = (email: EmailClassification) => {
    const result = extractionResults[email.id];
    setEditDialog({ email, result });
  };

  const handleSaveEdit = (updatedResult: ExtractionResult) => {
    setExtractionResults(prev => ({
      ...prev,
      [updatedResult.id]: updatedResult
    }));
    setEditDialog(null);
    showSnackbar('Extraction result updated', 'success');
  };

  const handleSaveToDashboard = async () => {
    try {
      const completedResults = Object.values(extractionResults).filter(r => r.extraction_status === 'completed');
      
      // Mock save to dashboard - in real implementation this would call window.electronAPI
      console.log('Saving to dashboard:', completedResults);
      
      showSnackbar(`Saved ${completedResults.length} job applications to dashboard`, 'success');
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to save to dashboard:', error);
      showSnackbar('Failed to save to dashboard', 'error');
    }
  };

  const showSnackbar = (message: string, severity: typeof snackbar.severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleLogout = async () => {
    try {
      await authData.signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <LoadingSpinner variant="dots" size="large" />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar 
              currentUser={currentUser} 
              onLogout={handleLogout}
              title="Step 3 of 3: Extract Job Details"
            />
          </Box>

          {/* Workflow Progress */}
          <Box sx={{ px: 3, py: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology color="primary" />
                  Job Detail Extraction Workflow
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Use LLM models to parse job details from confirmed job emails
                </Typography>
                <Stepper activeStep={2} orientation="horizontal">
                  {workflowSteps.map((step, index) => (
                    <Step key={step.label} completed={index < 2}>
                      <StepLabel>
                        <Box>
                          <Typography variant="subtitle2">{step.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {step.description}
                          </Typography>
                        </Box>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>
          </Box>

          {/* Model Selection - Full Width */}
          <Box sx={{ px: 3, py: 1 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology sx={{ color: accent }} />
                  Model Selection
                </Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Choose Model</InputLabel>
                  <Select
                    value={selectedModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={progress.isRunning}
                    label="Choose Model"
                  >
                    {availableModels.map(model => (
                      <MenuItem key={model.id} value={model.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {model.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {model.description}
                            </Typography>
                          </Box>
                          <Chip 
                            label={model.size}
                            size="small"
                            sx={{ 
                              backgroundColor: model.color,
                              color: 'white',
                              ml: 1
                            }}
                          />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <Alert severity="info">
                  <Typography variant="body2">
                    <strong>Selected:</strong> {selectedModelInfo.name}<br/>
                    <strong>Size:</strong> {selectedModelInfo.size} | Real-time switching supported
                  </Typography>
                </Alert>
              </CardContent>
            </Card>
          </Box>

          {/* Extraction Prompt - Full Width */}
          <Box sx={{ px: 3, py: 1 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Edit sx={{ color: accent }} />
                  Extraction Prompt
                </Typography>
                <TextField
                  multiline
                  fullWidth
                  rows={6}
                  value={customPrompt || defaultPrompt}
                  onChange={(e) => {
                    setCustomPrompt(e.target.value);
                    setIsPromptModified(e.target.value !== defaultPrompt);
                  }}
                  placeholder="Enter your custom extraction prompt..."
                  variant="outlined"
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    startIcon={<Refresh />}
                    onClick={() => {
                      setCustomPrompt(defaultPrompt);
                      setIsPromptModified(false);
                      showSnackbar('Prompt reset to default', 'info');
                    }}
                    disabled={!isPromptModified}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Save />}
                    onClick={() => {
                      // In real implementation, save prompt to backend
                      showSnackbar('Prompt saved successfully', 'success');
                    }}
                    disabled={!isPromptModified}
                  >
                    Save Prompt
                  </Button>
                </Box>
                {isPromptModified && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Typography variant="caption">
                      You have unsaved changes to the prompt
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* Batch Operations and Extraction Progress - Side by Side */}
          <Box sx={{ px: 3, py: 1 }}>
            <Grid container spacing={2}>
              {/* Batch Operations */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PlayArrow sx={{ color: accent }} />
                      Batch Operations
                    </Typography>
                    <Stack spacing={2}>
                      <Button
                        fullWidth
                        startIcon={<PlayArrow />}
                        variant="contained"
                        onClick={() => startExtraction(selectedEmails)}
                        disabled={selectedEmails.length === 0 || progress.isRunning}
                        sx={{ backgroundColor: accent }}
                      >
                        Parse Selected ({selectedEmails.length})
                      </Button>
                      
                      <Button
                        fullWidth
                        startIcon={<PlayArrow />}
                        variant="outlined"
                        onClick={() => startExtraction(emails.map(e => e.id))}
                        disabled={progress.isRunning}
                      >
                        Parse All ({emails.length})
                      </Button>
                      
                      {progress.isRunning && (
                        <Button
                          fullWidth
                          startIcon={<Stop />}
                          variant="outlined"
                          color="error"
                          onClick={stopExtraction}
                        >
                          Stop Extraction
                        </Button>
                      )}
                      
                      <Button
                        fullWidth
                        startIcon={<Clear />}
                        variant="text"
                        onClick={clearCompleted}
                        disabled={completedExtractions.length === 0 || progress.isRunning}
                      >
                        Clear Completed
                      </Button>

                      <Divider />
                      
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          fullWidth
                          startIcon={<SelectAll />}
                          onClick={handleSelectAll}
                        >
                          Select All
                        </Button>
                        <Button
                          size="small"
                          fullWidth
                          startIcon={<IndeterminateCheckBox />}
                          onClick={handleDeselectAll}
                        >
                          Deselect All
                        </Button>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              {/* Extraction Progress */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Speed sx={{ color: accent }} />
                      Extraction Progress
                    </Typography>
                    
                    {progress.isRunning ? (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="body2">
                            Processing {progress.current} of {progress.total}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {Math.round((progress.current / progress.total) * 100)}%
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={(progress.current / progress.total) * 100}
                          sx={{ mb: 2, height: 8, borderRadius: 4 }}
                        />
                        
                        {progress.currentEmail && (
                          <Box sx={{ mb: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Current: {progress.currentEmail.subject}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              From: {progress.currentEmail.from_address}
                            </Typography>
                          </Box>
                        )}
                        
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Speed sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption">
                              {progress.speed} emails/min
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Timer sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption">
                              ETA: {formatTime(progress.estimatedTimeRemaining)}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Ready to start extraction
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                          <Chip icon={<CheckCircle />} label={`${completedExtractions.length} Completed`} color="success" size="small" />
                          <Chip icon={<ErrorIcon />} label={`${failedExtractions.length} Failed`} color="error" size="small" />
                          <Chip icon={<Pending />} label={`${pendingExtractions.length} Pending`} color="default" size="small" />
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, px: 3, pb: 3 }}>
            <Grid container spacing={2} sx={{ height: '100%' }}>
              {/* Email List and Controls */}
              <Grid size={{ xs: 12, md: 8 }} sx={{ height: '100%' }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Card Title */}
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Email sx={{ color: accent }} />
                      Extraction
                    </Typography>
                  </Box>
                  
                  {/* Search and Filters */}
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search emails..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={loadJobEmails}>
                              <Refresh />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>

                  {/* Email List */}
                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    {filteredEmails.length === 0 ? (
                      <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          No confirmed job emails found for extraction.
                        </Typography>
                      </Box>
                    ) : (
                      <List sx={{ py: 0 }}>
                        {filteredEmails.map((email) => {
                          const result = extractionResults[email.id];
                          const isSelected = selectedEmails.includes(email.id);
                          
                          return (
                            <ListItem
                              key={email.id}
                              sx={{
                                py: 2,
                                px: 2,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                backgroundColor: isSelected 
                                  ? 'action.selected' 
                                  : 'inherit'
                              }}
                            >
                              <Box sx={{ mr: 1 }}>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleEmailSelect(email.id, e.target.checked)}
                                  disabled={progress.isRunning}
                                />
                              </Box>

                              <ListItemText
                                primary={
                                  <Box>
                                    <Typography variant="subtitle2" noWrap>
                                      {email.subject}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                      <Email sx={{ fontSize: 14 }} />
                                      <Typography variant="caption" color="text.secondary" noWrap>
                                        {email.from_address}
                                      </Typography>
                                      <CalendarToday sx={{ fontSize: 14, ml: 1 }} />
                                      <Typography variant="caption" color="text.secondary">
                                        {new Date(email.received_date).toLocaleDateString()}
                                      </Typography>
                                    </Box>
                                  </Box>
                                }
                                secondary={
                                  <Box sx={{ mt: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      {result.extraction_status === 'pending' && (
                                        <Chip 
                                          icon={<Pending />}
                                          label="Pending"
                                          size="small"
                                          color="default"
                                        />
                                      )}
                                      {result.extraction_status === 'parsing' && (
                                        <Chip 
                                          icon={<CircularProgress size={14} />}
                                          label="Parsing..."
                                          size="small"
                                          sx={{ backgroundColor: accent, color: 'white' }}
                                        />
                                      )}
                                      {result.extraction_status === 'completed' && (
                                        <>
                                          <Chip 
                                            icon={<CheckCircle />}
                                            label="Completed"
                                            size="small"
                                            color="success"
                                          />
                                          {result.company && (
                                            <Chip 
                                              label={result.company}
                                              size="small"
                                              sx={{ backgroundColor: 'primary.light', color: 'primary.contrastText' }}
                                            />
                                          )}
                                          {result.position && (
                                            <Chip 
                                              label={result.position}
                                              size="small"
                                              variant="outlined"
                                            />
                                          )}
                                        </>
                                      )}
                                      {result.extraction_status === 'failed' && (
                                        <Tooltip title={result.error_message || 'Extraction failed'}>
                                          <Chip 
                                            icon={<ErrorIcon />}
                                            label="Failed"
                                            size="small"
                                            color="error"
                                          />
                                        </Tooltip>
                                      )}
                                    </Box>
                                  </Box>
                                }
                              />

                              <ListItemSecondaryAction>
                                <Stack direction="row" spacing={0.5}>
                                  {result.extraction_status === 'completed' && (
                                    <IconButton
                                      size="small"
                                      onClick={() => handleEdit(email)}
                                    >
                                      <Edit />
                                    </IconButton>
                                  )}
                                </Stack>
                              </ListItemSecondaryAction>
                            </ListItem>
                          );
                        })}
                      </List>
                    )}
                  </Box>
                </Card>
              </Grid>

              {/* Results Preview */}
              <Grid size={{ xs: 12, md: 4 }} sx={{ height: '100%' }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Dashboard sx={{ color: accent }} />
                      Results
                    </Typography>
                    
                    {completedExtractions.length === 0 ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Psychology sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          No Results Yet
                        </Typography>
                        <Typography variant="body2" color="text.disabled">
                          Start extraction to see parsed job details here
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        <TableContainer component={Paper} sx={{ maxHeight: 300, mb: 2 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell>Company</TableCell>
                                <TableCell>Position</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Confidence</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {completedExtractions.map((result) => (
                                <TableRow key={result.id}>
                                  <TableCell>{result.company || 'N/A'}</TableCell>
                                  <TableCell>{result.position || 'N/A'}</TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={result.status || 'N/A'} 
                                      size="small" 
                                      variant="outlined"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {result.confidence && (
                                      <ConfidenceIndicator 
                                        confidence={Math.round(result.confidence)}
                                        variant="chip"
                                        size="small"
                                        showPercentage
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {completedExtractions.length} job{completedExtractions.length !== 1 ? 's' : ''} extracted successfully
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ px: 3, pb: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      variant="outlined"
                      startIcon={<ArrowBack />}
                      onClick={() => navigate('/classification-review')}
                    >
                      Back to Classification
                    </Button>
                    <Button
                      variant="text"
                      startIcon={<SkipNext />}
                      onClick={() => navigate('/dashboard')}
                    >
                      Skip to Dashboard
                    </Button>
                  </Box>
                  <Button
                    variant="contained"
                    size="large"
                    endIcon={<Save />}
                    onClick={handleSaveToDashboard}
                    disabled={completedExtractions.length === 0}
                    sx={{ 
                      py: 1.5,
                      px: 3,
                      fontSize: '1rem',
                      fontWeight: 600,
                      minWidth: 200,
                      backgroundColor: accent,
                      '&:hover': { backgroundColor: accent, filter: 'brightness(0.9)' }
                    }}
                  >
                    Save to Dashboard ({completedExtractions.length})
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Edit Dialog */}
        {editDialog && (
          <Dialog open={true} onClose={() => setEditDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle>Edit Extraction Result</DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  label="Company"
                  value={editDialog.result.company || ''}
                  onChange={(e) => setEditDialog({
                    ...editDialog,
                    result: { ...editDialog.result, company: e.target.value }
                  })}
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label="Position"
                  value={editDialog.result.position || ''}
                  onChange={(e) => setEditDialog({
                    ...editDialog,
                    result: { ...editDialog.result, position: e.target.value }
                  })}
                  sx={{ mb: 2 }}
                />
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={editDialog.result.status || 'Applied'}
                    onChange={(e) => setEditDialog({
                      ...editDialog,
                      result: { ...editDialog.result, status: e.target.value as any }
                    })}
                    label="Status"
                  >
                    <MenuItem value="Applied">Applied</MenuItem>
                    <MenuItem value="Interview">Interview</MenuItem>
                    <MenuItem value="Offer">Offer</MenuItem>
                    <MenuItem value="Declined">Declined</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label="Confidence (%)"
                  type="number"
                  value={editDialog.result.confidence || 0}
                  onChange={(e) => setEditDialog({
                    ...editDialog,
                    result: { ...editDialog.result, confidence: Number(e.target.value) }
                  })}
                  inputProps={{ min: 0, max: 100 }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditDialog(null)}>Cancel</Button>
              <Button onClick={() => handleSaveEdit(editDialog.result)} variant="contained">
                Save Changes
              </Button>
            </DialogActions>
          </Dialog>
        )}

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
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