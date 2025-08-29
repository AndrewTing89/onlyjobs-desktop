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
  StepLabel
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
    label: 'Fetch Emails',
    description: 'Connect Gmail accounts and fetch emails for processing',
    active: false
  },
  {
    label: 'Review Classifications',
    description: 'Review AI classifications and mark job-related emails',
    active: true
  },
  {
    label: 'Extract Job Details',
    description: 'Use LLM models to parse job details from confirmed job emails',
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
      
      // Fetch real data from the backend
      if (window.electronAPI && window.electronAPI.getClassificationQueue) {
        const result = await window.electronAPI.getClassificationQueue();
        
        if (result.success) {
          // Transform the data to match our EmailClassification type
          const transformedEmails: EmailClassification[] = result.emails.map((email: any) => ({
            ...email,
            ml_confidence: email.ml_confidence || 0,
            company: email.company || undefined,
            position: email.position || undefined,
            status: email.status || undefined
          }));
          
          setEmails(transformedEmails);
          setStats(result.stats);
          
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
        filtered = filtered.filter(email => email.review_status === 'needs_review');
        break;
      case 1: // High Confidence Jobs
        filtered = filtered.filter(email => email.ml_confidence > 70 && email.is_job_related);
        break;
      case 2: // Rejected
        filtered = filtered.filter(email => email.review_status === 'rejected');
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
      filtered = filtered.filter(email => email.ml_confidence >= filters.confidence_min!);
    }
    if (filters.confidence_max !== undefined) {
      filtered = filtered.filter(email => email.ml_confidence <= filters.confidence_max!);
    }

    return filtered.sort((a, b) => 
      new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
    );
  }, [emails, currentTab, searchQuery, filters]);

  const handleEmailSelect = (email: EmailClassification) => {
    setSelectedEmailForPreview(email);
  };

  const handleBulkOperation = async (request: BulkOperationRequest) => {
    try {
      setProcessing(true);
      
      // Mock implementation - in real app this would call window.electronAPI
      console.log('Bulk operation:', request);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update local state based on operation
      setEmails(prevEmails => {
        return prevEmails.map(email => {
          if (request.email_ids.includes(email.id)) {
            const updates: Partial<EmailClassification> = {};
            
            switch (request.operation) {
              case 'approve_as_job':
                updates.review_status = 'approved';
                updates.is_job_related = true;
                if (request.metadata?.company) updates.company = request.metadata.company;
                if (request.metadata?.position) updates.position = request.metadata.position;
                if (request.metadata?.status) updates.status = request.metadata.status;
                break;
              case 'reject_as_not_job':
                updates.review_status = 'rejected';
                updates.is_job_related = false;
                break;
              case 'queue_for_parsing':
                updates.review_status = 'queued_for_parsing';
                break;
              case 'mark_needs_review':
                updates.review_status = 'needs_review';
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
                  Workflow
                </Typography>
                <Stepper activeStep={1} orientation="horizontal">
                  {workflowSteps.map((step, index) => (
                    <Step 
                      key={step.label} 
                      completed={index < 1}
                      sx={{
                        '& .MuiStepLabel-root': {
                          ...(index === 1 && {
                            padding: '8px',
                            border: '2px solid #FF7043',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255, 112, 67, 0.04)'
                          })
                        }
                      }}
                    >
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
              <Grid size={{ xs: 12, md: 6 }} sx={{ height: '100%' }}>
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
                                        confidence={email.ml_confidence} 
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
                                      {new Date(email.received_date).toLocaleDateString()}
                                    </Typography>
                                  </Box>
                                }
                              />

                              <ListItemSecondaryAction>
                                <Stack direction="row" spacing={0.5}>
                                  {email.review_status === 'needs_review' && (
                                    <>
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBulkOperation({
                                            email_ids: [email.id],
                                            operation: 'approve_as_job'
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

              {/* Email Preview Panel */}
              <Grid size={{ xs: 12, md: 6 }} sx={{ height: '100%' }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent>
                    {selectedEmailForPreview ? (
                      <Box>
                        {/* Email Header */}
                        <Box sx={{ mb: 3 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                            <Typography variant="h6" sx={{ flexGrow: 1, mr: 2 }}>
                              {selectedEmailForPreview.subject}
                            </Typography>
                            <ConfidenceIndicator 
                              confidence={selectedEmailForPreview.ml_confidence}
                              variant="detailed"
                              size="small"
                            />
                          </Box>

                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="body2">{selectedEmailForPreview.from_address}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="body2">
                                {new Date(selectedEmailForPreview.received_date).toLocaleString()}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Email sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="body2">{selectedEmailForPreview.account_email}</Typography>
                            </Box>
                          </Box>
                        </Box>

                        <Divider sx={{ my: 2 }} />

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

                        {/* Action Buttons */}
                        {selectedEmailForPreview.review_status === 'needs_review' && (
                          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                            <Button
                              variant="contained"
                              startIcon={<CheckCircle />}
                              onClick={() => handleBulkOperation({
                                email_ids: [selectedEmailForPreview.id],
                                operation: 'approve_as_job'
                              })}
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
                              onClick={() => handleBulkOperation({
                                email_ids: [selectedEmailForPreview.id],
                                operation: 'reject_as_not_job'
                              })}
                              sx={{ 
                                backgroundColor: 'error.main',
                                '&:hover': { backgroundColor: 'error.dark' }
                              }}
                            >
                              Mark as Not Job
                            </Button>
                            <Button
                              variant="outlined"
                              startIcon={<Schedule />}
                              onClick={() => handleBulkOperation({
                                email_ids: [selectedEmailForPreview.id],
                                operation: 'queue_for_parsing'
                              })}
                            >
                              Parse Later
                            </Button>
                          </Box>
                        )}

                        {/* Email Content Preview */}
                        <Box sx={{ mt: 3 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Email Content
                          </Typography>
                          <Paper sx={{ p: 2, backgroundColor: 'grey.50', maxHeight: 300, overflow: 'auto' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                              {selectedEmailForPreview.raw_content || 'Email content not available'}
                            </Typography>
                          </Paper>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          Select an email to preview
                        </Typography>
                        <Typography variant="body2" color="text.disabled">
                          Choose an email from the list to see its details and classification results
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
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