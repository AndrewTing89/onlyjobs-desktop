import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Paper,
  Tabs,
  Tab,
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
  Badge,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  LinearProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Search,
  FilterList,
  Refresh,
  CheckCircle,
  Cancel,
  Email,
  Person,
  CalendarToday,
  Business,
  Work,
  Visibility,
  ArrowForward,
  RateReview,
  Psychology,
  PlayArrow,
  ThumbUp,
  ThumbDown,
  AutoAwesome,
  Speed,
  Timer
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

// Import auth context
import { useAuth } from '../contexts/ElectronAuthContext';

const accent = "#FF7043";

const workflowSteps = [
  {
    label: 'Step 1: Fetch & ML Classify',
    description: 'Fetch emails and ML classification',
    active: false
  },
  {
    label: 'Step 2: Review Classifications',
    description: 'Human review of ML classifications',
    active: false
  },
  {
    label: 'Step 3: LLM Extract',
    description: 'LLM extraction of job details',
    active: true
  }
];

// Available models for extraction
const availableModels = [
  {
    id: 'llama-3.2-3b-instruct-q5_k_m',
    name: 'Llama-3.2-3B-Instruct',
    description: 'Fast 3B model',
    size: '2.1GB'
  },
  {
    id: 'qwen2.5-3b-instruct-q5_k_m',
    name: 'Qwen2.5-3B-Instruct',
    description: 'Efficient 3B model',
    size: '2.0GB'
  },
  {
    id: 'phi-3.5-mini-instruct-q5_k_m',
    name: 'Phi-3.5-mini-instruct',
    description: 'Microsoft Phi-3.5 mini',
    size: '2.5GB'
  }
];

interface PipelineEmail {
  id?: number;              // Database ID
  gmail_message_id: string;
  thread_id?: string;       // Optional as it can be undefined
  account_email: string;
  subject: string;
  from_address: string;
  email_date: string;
  body: string;
  pipeline_stage: 'fetched' | 'digested' | 'classified' | 'HIL_approved' | 'HIL_rejected' | 'ready_for_extraction' | 'extracted' | 'in_jobs';
  is_job_related: boolean;
  job_probability: number;  // Primary field from new API
  confidence: number;       // Required for ConfidenceIndicator component
  human_verified: boolean;
  needs_review: boolean;
  review_reason?: string;
  classification_method?: string;
  is_digest?: boolean;
  digest_reason?: string;
  company?: string;
  position?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  selected_extraction?: any;
  extraction_attempts?: any[];
}

interface PipelineStats {
  total: number;
  classified: number;
  needs_review: number;
  ready_for_extraction: number;
  extracted: number;
  in_jobs: number;
}

export default function ExtractionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, signOut } = useAuth();
  
  // State
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState<PipelineEmail[]>([]);
  const [stats, setStats] = useState<PipelineStats>({
    total: 0,
    classified: 0,
    needs_review: 0,
    ready_for_extraction: 0,
    extracted: 0,
    in_jobs: 0
  });
  
  // No tabs needed - this page is only for extraction
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.9);
  const [selectedModel, setSelectedModel] = useState(availableModels[0].id);
  const [extracting, setExtracting] = useState(false);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Load emails from pipeline
  const loadPipelineData = async () => {
    try {
      setLoading(true);
      
      if (window.electronAPI?.pipeline?.getEmails) {
        const result = await window.electronAPI.pipeline.getEmails({
          accountEmail: accountFilter !== 'all' ? accountFilter : undefined,
          stages: ['ready_for_extraction', 'extracted', 'in_jobs'],
          limit: 500
        });
        
        if (result.success) {
          // Ensure confidence field is present (it's aliased from job_probability in backend)
          const emailsWithConfidence = (result.emails || []).map((email: any) => ({
            ...email,
            confidence: email.confidence || email.job_probability || 0
          }));
          setEmails(emailsWithConfidence);
          
          // Calculate stats
          const emailArray = emailsWithConfidence;
          const newStats: PipelineStats = {
            total: emailArray.length,
            classified: emailArray.filter((e: any) => 
              e.pipeline_stage === 'classified' && !e.needs_review
            ).length,
            needs_review: emailArray.filter((e: any) => e.needs_review).length,
            ready_for_extraction: emailArray.filter((e: any) => 
              e.pipeline_stage === 'ready_for_extraction'
            ).length,
            extracted: emailArray.filter((e: any) => 
              e.pipeline_stage === 'extracted'
            ).length,
            in_jobs: emailArray.filter((e: any) => 
              e.pipeline_stage === 'in_jobs'
            ).length
          };
          setStats(newStats);
        }
      }
    } catch (error) {
      console.error('Error loading pipeline data:', error);
      showSnackbar('Failed to load emails', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadPipelineData();
  }, [accountFilter]);

  // Filter emails - only show emails ready for extraction
  const filteredEmails = useMemo(() => {
    let filtered = emails.filter(e => 
      e.pipeline_stage === 'ready_for_extraction' ||
      e.pipeline_stage === 'extracted'
    );
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e => 
        e.subject?.toLowerCase().includes(query) ||
        e.from_address?.toLowerCase().includes(query) ||
        e.body?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [emails, searchQuery]);

  // Get unique accounts
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set(emails.map(e => e.account_email));
    return Array.from(accounts).filter(Boolean);
  }, [emails]);

  // Handlers
  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSelectAll = () => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredEmails.map(e => e.gmail_message_id)));
    }
  };

  const handleSelectEmail = (emailId: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId);
    } else {
      newSelected.add(emailId);
    }
    setSelectedEmails(newSelected);
  };

  const handleReviewEmail = async (email: PipelineEmail, isJobRelated: boolean) => {
    try {
      if (window.electronAPI?.reviewClassification) {
        const result = await window.electronAPI.reviewClassification({
          gmailMessageId: email.gmail_message_id,
          accountEmail: email.account_email,
          isJobRelated,
          confidence: 1.0 // Manual review = 100% confidence
        });
        
        if (result.success) {
          showSnackbar(
            `Email marked as ${isJobRelated ? 'job-related' : 'not job-related'}`,
            'success'
          );
          await loadPipelineData();
        }
      }
    } catch (error) {
      console.error('Error reviewing email:', error);
      showSnackbar('Failed to update classification', 'error');
    }
  };

  const handleBulkApprove = async () => {
    try {
      if (window.electronAPI?.bulkApproveClassifications) {
        const result = await window.electronAPI.bulkApproveClassifications({
          accountEmail: accountFilter !== 'all' ? accountFilter : null,
          confidenceThreshold
        });
        
        if (result.success) {
          showSnackbar(`Approved ${result.approved} high-confidence classifications`, 'success');
          await loadPipelineData();
        }
      }
    } catch (error) {
      console.error('Error bulk approving:', error);
      showSnackbar('Failed to bulk approve', 'error');
    }
  };

  const handleExtract = async () => {
    try {
      setExtracting(true);
      
      // Get emails ready for extraction
      const toExtract = emails.filter(e => 
        e.pipeline_stage === 'ready_for_extraction' &&
        (selectedEmails.size === 0 || selectedEmails.has(e.gmail_message_id))
      );
      
      if (toExtract.length === 0) {
        showSnackbar('No emails ready for extraction', 'info');
        return;
      }
      
      // Call the extraction API with selected model
      showSnackbar(`Starting extraction for ${toExtract.length} emails with ${selectedModel}...`, 'info');
      
      if (window.electronAPI?.runExtraction) {
        // Get model path (you might need to add a method to get this)
        const modelPath = `/Users/ndting/Library/Application Support/models/${selectedModel}.gguf`;
        
        const result = await window.electronAPI.runExtraction({
          modelId: selectedModel,
          modelPath: modelPath,
          limit: toExtract.length
        });
        
        if (result.success) {
          showSnackbar(
            `Extraction completed: ${result.data?.successful || 0} successful, ${result.data?.failed || 0} failed`,
            'success'
          );
          await loadPipelineData();
        } else {
          throw new Error(result.error || 'Extraction failed');
        }
      } else {
        throw new Error('Extraction API not available');
      }
      
    } catch (error) {
      console.error('Error extracting:', error);
      showSnackbar('Extraction failed', 'error');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
        <Sidebar currentPath={location.pathname} />
        
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <TopBar 
            currentUser={currentUser || undefined}
            onLogout={signOut}
          />
          
          <Box sx={{ p: 3, flexGrow: 1 }}>
            {/* Workflow Stepper */}
            <Paper sx={{ p: 2, mb: 3 }}>
              <Stepper activeStep={2} alternativeLabel>
                {workflowSteps.map((step) => (
                  <Step key={step.label}>
                    <StepLabel>{step.label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Paper>

            {/* Stats Overview */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Total Emails
                    </Typography>
                    <Typography variant="h4">
                      {stats.total}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Needs Review
                    </Typography>
                    <Typography variant="h4" color={stats.needs_review > 0 ? 'warning.main' : 'inherit'}>
                      {stats.needs_review}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Ready to Extract
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {stats.ready_for_extraction}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Extracted
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {stats.extracted}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2.4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      In Jobs
                    </Typography>
                    <Typography variant="h4">
                      {stats.in_jobs}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Main Content */}
            <Card>
              <CardContent>
                <Typography variant="h5" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology />
                  LLM Extraction
                  <Chip label={`${stats.ready_for_extraction} ready`} color="primary" size="small" />
                </Typography>

                {/* Toolbar */}
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <TextField
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="small"
                    sx={{ flexGrow: 1, maxWidth: 400 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    }}
                  />
                  
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Account</InputLabel>
                    <Select
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                      label="Account"
                    >
                      <MenuItem value="all">All Accounts</MenuItem>
                      {uniqueAccounts.map(account => (
                        <MenuItem key={account} value={account}>{account}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={loadPipelineData}
                  >
                    Refresh
                  </Button>
                  
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Model</InputLabel>
                    <Select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      label="Model"
                    >
                      {availableModels.map(model => (
                        <MenuItem key={model.id} value={model.id}>
                          {model.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={extracting ? <CircularProgress size={20} /> : <PlayArrow />}
                    onClick={handleExtract}
                    disabled={extracting || stats.ready_for_extraction === 0}
                  >
                    {extracting ? 'Extracting...' : 'Start Extraction'}
                  </Button>
                </Stack>

                {/* Email Table */}
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={selectedEmails.size > 0 && selectedEmails.size < filteredEmails.length}
                            checked={filteredEmails.length > 0 && selectedEmails.size === filteredEmails.length}
                            onChange={handleSelectAll}
                          />
                        </TableCell>
                        <TableCell>Subject</TableCell>
                        <TableCell>From</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Confidence</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <CircularProgress />
                          </TableCell>
                        </TableRow>
                      ) : filteredEmails.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <Typography color="textSecondary">
                              No emails to extract
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEmails.map(email => (
                          <TableRow key={email.gmail_message_id}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selectedEmails.has(email.gmail_message_id)}
                                onChange={() => handleSelectEmail(email.gmail_message_id)}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                                {email.subject || '(No subject)'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {email.from_address}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {new Date(email.email_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <ConfidenceIndicator confidence={email.confidence} />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={email.pipeline_stage.replace('_', ' ')}
                                size="small"
                                color={
                                  email.pipeline_stage === 'ready_for_extraction' ? 'primary' :
                                  email.pipeline_stage === 'extracted' ? 'success' :
                                  email.needs_review ? 'warning' : 'default'
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {false && (
                                <Stack direction="row" spacing={1}>
                                  <Tooltip title="Mark as job-related">
                                    <IconButton
                                      size="small"
                                      color="success"
                                      onClick={() => handleReviewEmail(email, true)}
                                    >
                                      <ThumbUp />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Mark as not job-related">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleReviewEmail(email, false)}
                                    >
                                      <ThumbDown />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              )}
                              {email.pipeline_stage === 'extracted' && (
                                <Chip
                                  icon={<CheckCircle />}
                                  label="Extracted"
                                  size="small"
                                  color="success"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>

            {/* Navigation */}
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
              <Button
                variant="outlined"
                startIcon={<ArrowForward sx={{ transform: 'rotate(180deg)' }} />}
                onClick={() => navigate('/classification-review')}
              >
                Back to Review
              </Button>
              <Button
                variant="contained"
                endIcon={<Work />}
                onClick={() => navigate('/jobs')}
              >
                View Jobs
              </Button>
            </Stack>
          </Box>
        </Box>
        
        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert 
            onClose={() => setSnackbar({ ...snackbar, open: false })} 
            severity={snackbar.severity}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}