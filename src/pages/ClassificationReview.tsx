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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Search,
  FilterList,
  Refresh,
  CheckCircle,
  Cancel,
  Schedule,
  Email,
  Person,
  CalendarToday,
  Business,
  Work,
  Visibility,
  ArrowForward,
  RateReview
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
import BulkOperationsToolbar from '../components/BulkOperationsToolbar';

// Import types
import type { 
  EmailClassification, 
  ClassificationFilters, 
  BulkOperationRequest,
  ClassificationStats
} from '../types/classification';

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
    active: true
  },
  {
    label: 'Step 3: LLM Extract',
    description: 'LLM extraction of job details',
    active: false
  }
];

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index} style={{ height: '100%' }}>
      {value === index && children}
    </div>
  );
}

export default function ClassificationReview() {
  const location = useLocation();
  const navigate = useNavigate();
  const authData = useAuth() as any;
  const currentUser = authData.currentUser;

  // State management
  const [emails, setEmails] = useState<EmailClassification[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedEmailForPreview, setSelectedEmailForPreview] = useState<EmailClassification | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ClassificationStats | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ClassificationFilters>({});
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: '', 
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  // Load classification data
  useEffect(() => {
    loadClassificationData();
  }, []);

  const loadClassificationData = async () => {
    try {
      setLoading(true);
      
      // Fetch real data from the backend using classification queue API
      if (window.electronAPI && window.electronAPI.getClassificationQueue) {
        const result = await window.electronAPI.getClassificationQueue({
          // Get all emails - we'll filter client-side for more flexibility
          limit: 1500
        });
        
        if (result.success && result.emails) {
          // Transform the data to match our EmailClassification type
          const transformedEmails: EmailClassification[] = result.emails
            .filter((email: any) => 
              email.needs_review || 
              email.pipeline_stage === 'classified' || 
              email.pipeline_stage === 'ready_for_extraction'
            )
            .map((email: any) => ({
            id: email.gmail_message_id,
            gmail_message_id: email.gmail_message_id,
            thread_id: email.thread_id,
            subject: email.subject || '',
            from_address: email.from_address || '',
            plaintext: email.plaintext,
            body_html: email.body_html,
            date_received: email.date_received,
            account_email: email.account_email || '',
            
            // ML Classification results
            ml_classification: email.ml_classification,
            job_probability: email.job_probability || 0,
            is_job_related: email.is_job_related,
            is_classified: email.is_classified || false,
            
            // Pipeline workflow stages  
            pipeline_stage: email.pipeline_stage || 'classified',
            classification_method: email.classification_method,
            
            // Links and metadata
            jobs_table_id: email.jobs_table_id,
            needs_review: email.needs_review,
            review_reason: email.review_reason,
            user_feedback: email.user_feedback,
            
            // User review tracking
            user_classification: email.user_classification,
            reviewed_at: email.reviewed_at,
            reviewed_by: email.reviewed_by,
            company: email.company || undefined,
            position: email.position || undefined,
            status: email.status || undefined,
            created_at: email.created_at || new Date().toISOString(),
            updated_at: email.updated_at || new Date().toISOString()
          }));
          
          setEmails(transformedEmails);
          
          // Calculate stats from the emails
          const calculatedStats = {
            total_emails: transformedEmails.length,
            needs_review: transformedEmails.filter(e => e.needs_review && !e.user_classification).length,
            high_confidence_jobs: transformedEmails.filter(e => e.job_probability > 0.9 && e.is_job_related).length,
            rejected: transformedEmails.filter(e => e.user_classification === 'HIL_rejected' || (!e.is_job_related && e.is_classified)).length,
            queued_for_parsing: transformedEmails.filter(e => e.pipeline_stage === 'ready_for_extraction' || e.user_classification === 'HIL_approved').length,
            avg_confidence: transformedEmails.length > 0 
              ? transformedEmails.reduce((sum, e) => sum + e.job_probability, 0) / transformedEmails.length 
              : 0
          };
          
          setStats(calculatedStats);
          
          // Select first email for preview
          if (transformedEmails.length > 0) {
            setSelectedEmailForPreview(transformedEmails[0]);
          }
        } else {
          console.error('Failed to load classification data:', result.error);
          showSnackbar('Failed to load classification data', 'error');
          // Set empty state
          setEmails([]);
          setStats({
            total_emails: 0,
            needs_review: 0,
            high_confidence_jobs: 0,
            rejected: 0,
            queued_for_parsing: 0,
            avg_confidence: 0
          });
        }
      } else {
        // Fallback for development without Electron
        console.warn('Electron API not available, using empty data');
        setEmails([]);
        setStats({
          total_emails: 0,
          needs_review: 0,
          high_confidence_jobs: 0,
          rejected: 0,
          queued_for_parsing: 0,
          avg_confidence: 0
        });
      }
    } catch (error) {
      console.error('Error loading classification data:', error);
      showSnackbar('Failed to load classification data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filter emails based on current tab and search/filters
  const filteredEmails = useMemo(() => {
    let filtered = emails;

    // Filter by tab
    switch (currentTab) {
      case 0: // Needs Review
        filtered = filtered.filter(email => email.needs_review && !email.user_classification);
        break;
      case 1: // High Confidence Jobs
        filtered = filtered.filter(email => email.job_probability > 0.7 && email.is_job_related);
        break;
      case 2: // Rejected
        filtered = filtered.filter(email => email.user_classification === 'HIL_rejected' || (!email.is_job_related && email.is_classified));
        break;
      case 3: // All
        break;
    }

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

    // Apply additional filters
    if (filters.confidence_min !== undefined) {
      filtered = filtered.filter(email => email.job_probability >= filters.confidence_min!);
    }
    if (filters.confidence_max !== undefined) {
      filtered = filtered.filter(email => email.job_probability <= filters.confidence_max!);
    }

    return filtered.sort((a, b) => 
      new Date(b.date_received).getTime() - new Date(a.date_received).getTime()
    );
  }, [emails, currentTab, searchQuery, filters]);

  const handleEmailSelect = (email: EmailClassification) => {
    setSelectedEmailForPreview(email);
    setEmailDialogOpen(true);
  };

  const handleCloseEmailDialog = () => {
    setEmailDialogOpen(false);
  };

  const handleBulkOperation = async (request: BulkOperationRequest) => {
    try {
      setProcessing(true);
      
      // Handle different operations based on type
      if (request.operation === 'approve_for_extraction' || request.operation === 'reject_as_not_job') {
        // Use the new review-classification API for individual emails
        const isJobRelated = request.operation === 'approve_for_extraction';
        
        for (const emailId of request.email_ids) {
          const email = emails.find(e => e.id === emailId);
          if (email && window.electronAPI?.reviewClassification) {
            await window.electronAPI.reviewClassification({
              gmailMessageId: emailId,
              accountEmail: email.account_email,
              isJobRelated,
              confidence: 1.0 // Manual review = 100% confidence
            });
          }
        }
        
        showSnackbar(
          `${request.email_ids.length} email(s) marked as ${isJobRelated ? 'job-related' : 'not job-related'}`,
          'success'
        );
      }
      
      // Update local state based on operation
      setEmails(prevEmails => {
        return prevEmails.map(email => {
          if (request.email_ids.includes(email.id)) {
            const updates: Partial<EmailClassification> = {};
            
            switch (request.operation) {
              case 'approve_for_extraction':
                updates.user_classification = 'HIL_approved';
                updates.is_job_related = true;
                updates.pipeline_stage = 'ready_for_extraction';
                updates.needs_review = false;
                updates.reviewed_at = new Date().toISOString();
                if (request.metadata?.user_feedback) updates.user_feedback = request.metadata.user_feedback;
                break;
              case 'reject_as_not_job':
                updates.user_classification = 'HIL_rejected';
                updates.is_job_related = false;
                updates.pipeline_stage = 'classified';
                updates.needs_review = false;
                updates.reviewed_at = new Date().toISOString();
                if (request.metadata?.user_feedback) updates.user_feedback = request.metadata.user_feedback;
                break;
              case 'mark_needs_review':
                updates.needs_review = true;
                updates.user_classification = undefined;
                updates.reviewed_at = undefined;
                break;
              case 'mark_reviewed':
                updates.needs_review = false;
                updates.reviewed_at = new Date().toISOString();
                if (request.metadata?.pipeline_stage) updates.pipeline_stage = request.metadata.pipeline_stage;
                if (request.metadata?.user_classification) updates.user_classification = request.metadata.user_classification;
                break;
            }
            
            return { ...email, ...updates, updated_at: new Date().toISOString() };
          }
          return email;
        });
      });
      
      // Clear selection
      setSelectedEmails([]);
      
      showSnackbar(`Successfully processed ${request.email_ids.length} emails`, 'success');
    } catch (error) {
      console.error('Bulk operation failed:', error);
      showSnackbar('Bulk operation failed', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSelectAll = () => {
    setSelectedEmails(filteredEmails.map(email => email.id));
  };

  const handleDeselectAll = () => {
    setSelectedEmails([]);
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
              title="Step 2 of 3: Review Classifications"
            />
          </Box>

          {/* Workflow Progress */}
          <Box sx={{ px: 3, py: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <RateReview color="primary" />
                  Classification Workflow Progress
                </Typography>
                <Stepper activeStep={1} orientation="horizontal">
                  {workflowSteps.map((step, index) => (
                    <Step key={step.label} completed={index < 1}>
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

          {/* Stats Cards */}
          {stats && (
            <Box sx={{ px: 3, py: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Card sx={{ textAlign: 'center' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h4" color="warning.main" sx={{ fontWeight: 600 }}>
                        {stats.needs_review}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Needs Review
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Card sx={{ textAlign: 'center' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h4" color="success.main" sx={{ fontWeight: 600 }}>
                        {stats.high_confidence_jobs}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        High Confidence
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Card sx={{ textAlign: 'center' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h4" color="error.main" sx={{ fontWeight: 600 }}>
                        {stats.rejected}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Rejected
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Card sx={{ textAlign: 'center' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h4" color="primary.main" sx={{ fontWeight: 600 }}>
                        {Math.round(stats.avg_confidence)}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Confidence
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, px: 3, pb: 3 }}>
            <Grid container spacing={2} sx={{ height: '100%' }}>
              {/* Email List Panel */}
              <Grid size={{ xs: 12 }} sx={{ height: '100%' }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Tabs and Filters */}
                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs 
                      value={currentTab} 
                      onChange={(_, value) => setCurrentTab(value)}
                      sx={{ px: 2 }}
                    >
                      <Tab 
                        label={
                          <Badge badgeContent={stats?.needs_review} color="warning">
                            Needs Review
                          </Badge>
                        } 
                      />
                      <Tab 
                        label={
                          <Badge badgeContent={stats?.high_confidence_jobs} color="success">
                            High Confidence
                          </Badge>
                        } 
                      />
                      <Tab 
                        label={
                          <Badge badgeContent={stats?.rejected} color="error">
                            Rejected
                          </Badge>
                        } 
                      />
                      <Tab label="All" />
                    </Tabs>
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
                            <IconButton size="small" onClick={loadClassificationData}>
                              <Refresh />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>

                  {/* Bulk Operations Toolbar */}
                  <BulkOperationsToolbar
                    selectedEmails={selectedEmails}
                    totalEmails={filteredEmails.length}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                    onBulkOperation={handleBulkOperation}
                    isProcessing={processing}
                  />

                  {/* Email List */}
                  <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <TabPanel value={currentTab} index={currentTab}>
                      {filteredEmails.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            No emails found for the current filter.
                          </Typography>
                        </Box>
                      ) : (
                        <List sx={{ py: 0 }}>
                          {filteredEmails.map((email) => (
                            <ListItem
                              key={email.id}
                              sx={{
                                py: 2,
                                px: 2,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                cursor: 'pointer',
                                backgroundColor: selectedEmailForPreview?.id === email.id 
                                  ? 'action.selected' 
                                  : 'inherit',
                                '&:hover': {
                                  backgroundColor: 'action.hover'
                                }
                              }}
                              onClick={() => handleEmailSelect(email)}
                            >
                              <Box sx={{ mr: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedEmails.includes(email.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (e.target.checked) {
                                      setSelectedEmails(prev => [...prev, email.id]);
                                    } else {
                                      setSelectedEmails(prev => prev.filter(id => id !== email.id));
                                    }
                                  }}
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
                                    </Box>
                                  </Box>
                                }
                                secondary={
                                  <Box sx={{ mt: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                      <ConfidenceIndicator 
                                        confidence={email.job_probability} 
                                        variant="chip" 
                                        size="small"
                                        showPercentage
                                      />
                                      {email.is_job_related && email.company && (
                                        <Chip 
                                          label={`${email.company}${email.position ? ` - ${email.position}` : ''}`}
                                          size="small"
                                          sx={{ backgroundColor: 'primary.light', color: 'primary.contrastText' }}
                                        />
                                      )}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                      {new Date(email.date_received).toLocaleDateString()}
                                    </Typography>
                                  </Box>
                                }
                              />

                              <ListItemSecondaryAction>
                                <Stack direction="row" spacing={0.5}>
                                  {email.needs_review && !email.user_classification && (
                                    <>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBulkOperation({
                                            email_ids: [email.id],
                                            operation: 'approve_for_extraction'
                                          });
                                        }}
                                        sx={{ color: 'success.main' }}
                                      >
                                        <CheckCircle />
                                      </IconButton>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBulkOperation({
                                            email_ids: [email.id],
                                            operation: 'reject_as_not_job'
                                          });
                                        }}
                                        sx={{ color: 'error.main' }}
                                      >
                                        <Cancel />
                                      </IconButton>
                                    </>
                                  )}
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedEmailForPreview(email);
                                    }}
                                  >
                                    <Visibility />
                                  </IconButton>
                                </Stack>
                              </ListItemSecondaryAction>
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </TabPanel>
                  </Box>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Workflow Actions */}
          <Box sx={{ px: 3, pb: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Ready to proceed?
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Once you've reviewed and approved job-related emails, proceed to extract detailed job information.
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="large"
                    endIcon={<ArrowForward />}
                    onClick={() => navigate('/extraction')}
                    sx={{ 
                      py: 1.5,
                      px: 3,
                      fontSize: '1rem',
                      fontWeight: 600,
                      minWidth: 200
                    }}
                  >
                    Proceed to Extraction
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Email Preview Dialog */}
        <Dialog 
          open={emailDialogOpen} 
          onClose={handleCloseEmailDialog}
          maxWidth="md"
          fullWidth
        >
          {selectedEmailForPreview && (
            <>
              <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography variant="h6" sx={{ flexGrow: 1, mr: 2 }}>
                    {selectedEmailForPreview.subject}
                  </Typography>
                  <ConfidenceIndicator 
                    confidence={selectedEmailForPreview.job_probability}
                    variant="detailed"
                    size="small"
                  />
                </Box>
              </DialogTitle>
              <DialogContent dividers>
                {/* Email Header Info */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2">{selectedEmailForPreview.from_address}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2">
                        {new Date(selectedEmailForPreview.date_received).toLocaleString()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Email sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2">{selectedEmailForPreview.account_email}</Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Classification Results */}
                {selectedEmailForPreview.is_job_related && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Extracted Information
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {selectedEmailForPreview.company && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Business sx={{ fontSize: 16, color: 'primary.main' }} />
                          <Typography variant="body2">
                            <strong>Company:</strong> {selectedEmailForPreview.company}
                          </Typography>
                        </Box>
                      )}
                      {selectedEmailForPreview.position && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Work sx={{ fontSize: 16, color: 'primary.main' }} />
                          <Typography variant="body2">
                            <strong>Position:</strong> {selectedEmailForPreview.position}
                          </Typography>
                        </Box>
                      )}
                      {selectedEmailForPreview.status && (
                        <Typography variant="body2">
                          <strong>Status:</strong> {selectedEmailForPreview.status}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {/* Email Content Preview */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Email Content
                  </Typography>
                  <Paper sx={{ p: 2, backgroundColor: 'grey.50', maxHeight: 400, overflow: 'auto' }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {selectedEmailForPreview.plaintext || 'Email content not available'}
                    </Typography>
                  </Paper>
                </Box>
              </DialogContent>
              <DialogActions>
                {selectedEmailForPreview.needs_review && !selectedEmailForPreview.user_classification && (
                  <>
                    <Button
                      variant="contained"
                      startIcon={<CheckCircle />}
                      onClick={() => {
                        handleBulkOperation({
                          email_ids: [selectedEmailForPreview.id],
                          operation: 'approve_for_extraction'
                        });
                        handleCloseEmailDialog();
                      }}
                      sx={{ 
                        backgroundColor: 'success.main',
                        '&:hover': { backgroundColor: 'success.dark' }
                      }}
                    >
                      Mark as Job
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<Cancel />}
                      onClick={() => {
                        handleBulkOperation({
                          email_ids: [selectedEmailForPreview.id],
                          operation: 'reject_as_not_job'
                        });
                        handleCloseEmailDialog();
                      }}
                      sx={{ 
                        backgroundColor: 'error.main',
                        '&:hover': { backgroundColor: 'error.dark' }
                      }}
                    >
                      Not a Job
                    </Button>
                  </>
                )}
                <Button onClick={handleCloseEmailDialog}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>

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