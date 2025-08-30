import React, { useState, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
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
  DialogActions,
  Tooltip
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
  RateReview,
  Close,
  Download
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
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [selectedEmailForPreview, setSelectedEmailForPreview] = useState<EmailClassification | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ClassificationStats | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ClassificationFilters>({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
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
            job_probability: email.job_probability || 0,
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

  // Calculate tab counts based on actual email data
  const tabCounts = useMemo(() => {
    return {
      needsReview: emails.filter(email => email.needs_review === true).length,
      jobRelated: emails.filter(email => email.job_probability > 0.9 && email.is_job_related).length,
      rejected: emails.filter(email => email.is_job_related === false).length,
      all: emails.length
    };
  }, [emails]);

  // Filter emails based on current tab and search/filters
  const filteredEmails = useMemo(() => {
    let filtered = emails;

    // Filter by tab
    switch (currentTab) {
      case 0: // Needs Review
        filtered = filtered.filter(email => email.needs_review === true);
        break;
      case 1: // Job Related (High Confidence)
        filtered = filtered.filter(email => email.job_probability > 0.9 && email.is_job_related);
        break;
      case 2: // Rejected (non-job emails)
        filtered = filtered.filter(email => email.is_job_related === false);
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
      new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
    );
  }, [emails, currentTab, searchQuery, filters]);

  const handleEmailSelect = (email: EmailClassification) => {
    setSelectedEmailForPreview(email);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  const handleBulkOperation = async (request: BulkOperationRequest) => {
    try {
      setProcessing(true);
      
      // If email_ids is empty, we need to filter emails based on confidence for Smart Actions
      let emailIds = request.email_ids;
      
      if (emailIds.length === 0) {
        // Smart Actions - filter based on job probability (stored as 0-1 range)
        if (request.operation === 'approve_as_job') {
          // Auto-approve high probability (>90% = >0.9)
          emailIds = filteredEmails
            .filter(email => email.job_probability > 0.9)
            .map(email => email.id);
        } else if (request.operation === 'reject_as_not_job') {
          // Auto-reject low probability (<30% = <0.3)
          emailIds = filteredEmails
            .filter(email => email.job_probability < 0.3)
            .map(email => email.id);
        }
        
        if (emailIds.length === 0) {
          showSnackbar('No emails matched the criteria', 'info');
          return;
        }
      }
      
      // Call Electron API to perform bulk operation
      const result = await window.electronAPI.classificationBulkOperation({
        ...request,
        emailIds: emailIds
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Bulk operation failed');
      }
      
      // Clear selection after bulk operation
      setSelectedEmails([]);
      
      // Refresh data
      await loadClassificationData();
      
      showSnackbar(`Successfully processed ${emailIds.length} emails`, 'success');
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

  const handleExportTrainingData = async (format: 'json' | 'csv') => {
    try {
      setProcessing(true);
      setExportDialogOpen(false);
      
      if (window.electronAPI && window.electronAPI.exportTrainingData) {
        const result = await window.electronAPI.exportTrainingData(format);
        
        if (result.success) {
          const formatLabel = format.toUpperCase();
          showSnackbar(
            `Successfully exported ${result.recordCount} records as ${formatLabel} to ${result.filePath}`, 
            'success'
          );
        } else {
          showSnackbar(result.error || 'Export failed', 'error');
        }
      } else {
        showSnackbar('Export functionality not available', 'error');
      }
    } catch (error) {
      console.error('Export error:', error);
      showSnackbar('Failed to export training data', 'error');
    } finally {
      setProcessing(false);
    }
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
                        Job Related
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
                        {Math.round(stats.avg_confidence * 100)}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Job Probability
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Main Content - Full Width Email List */}
          <Box sx={{ flexGrow: 1, px: 3, pb: 3 }}>
            <Grid container sx={{ height: '100%' }}>
              <Grid size={12} sx={{ height: '100%' }}>
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
                          <Badge 
                            badgeContent={tabCounts.needsReview} 
                            color="warning"
                            max={999}
                          >
                            Needs Review
                          </Badge>
                        } 
                      />
                      <Tab 
                        label={
                          <Badge 
                            badgeContent={tabCounts.jobRelated} 
                            color="success"
                            max={999}
                          >
                            Job Related
                          </Badge>
                        } 
                      />
                      <Tab 
                        label={
                          <Badge 
                            badgeContent={tabCounts.rejected} 
                            color="error"
                            max={999}
                          >
                            Rejected
                          </Badge>
                        } 
                      />
                      <Tab label="All" />
                    </Tabs>
                  </Box>

                  {/* Search and Filters */}
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                      <Tooltip title="Export all classified emails with ML predictions and human corrections for training data">
                        <span>
                          <Button
                            variant="outlined"
                            startIcon={<Download />}
                            onClick={() => setExportDialogOpen(true)}
                            disabled={processing || emails.length === 0}
                            sx={{ 
                              minWidth: 150,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Export Data
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
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
                              onClick={(e) => {
                                // Don't open modal if clicking on checkbox area
                                const target = e.target as HTMLElement;
                                if (target.tagName !== 'INPUT' && !target.closest('.checkbox-wrapper')) {
                                  handleEmailSelect(email);
                                }
                              }}
                            >
                              <Box 
                                sx={{ 
                                  mr: 2, 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  '& input[type="checkbox"]': {
                                    width: '20px',
                                    height: '20px',
                                    cursor: 'pointer'
                                  }
                                }} 
                                className="checkbox-wrapper" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentIndex = filteredEmails.findIndex(e => e.id === email.id);
                                  
                                  if ((e as any).shiftKey && lastSelectedIndex !== null) {
                                    // Shift+click: select range
                                    const start = Math.min(lastSelectedIndex, currentIndex);
                                    const end = Math.max(lastSelectedIndex, currentIndex);
                                    const rangeIds = filteredEmails
                                      .slice(start, end + 1)
                                      .map(e => e.id);
                                    
                                    setSelectedEmails(prev => {
                                      const newSelection = new Set(prev);
                                      rangeIds.forEach(id => newSelection.add(id));
                                      return Array.from(newSelection);
                                    });
                                  } else {
                                    // Regular click: toggle single selection
                                    if (selectedEmails.includes(email.id)) {
                                      setSelectedEmails(prev => prev.filter(id => id !== email.id));
                                    } else {
                                      setSelectedEmails(prev => [...prev, email.id]);
                                    }
                                    setLastSelectedIndex(currentIndex);
                                  }
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedEmails.includes(email.id)}
                                  onChange={() => {}}
                                  style={{ pointerEvents: 'none' }}
                                />
                              </Box>

                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ flexGrow: 1, mr: 2 }}>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                                        {email.subject}
                                      </Typography>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                          <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
                                          <Typography variant="body2" color="text.secondary">
                                            {email.from_address}
                                          </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                          <CalendarToday sx={{ fontSize: 14, color: 'text.secondary' }} />
                                          <Typography variant="body2" color="text.secondary">
                                            Received: {new Date(email.received_date).toLocaleDateString()}
                                          </Typography>
                                        </Box>
                                        {email.processed_at && (
                                          <Typography variant="caption" color="text.secondary" sx={{ ml: 2.5 }}>
                                            Classified: {new Date(email.processed_at).toLocaleDateString()}
                                          </Typography>
                                        )}
                                      </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <ConfidenceIndicator 
                                        confidence={email.job_probability} 
                                        variant="chip" 
                                        size="small"
                                        showPercentage
                                      />
                                      {email.is_job_related && (
                                        <Chip 
                                          label="Job Related"
                                          size="small"
                                          color="success"
                                          variant="outlined"
                                        />
                                      )}
                                      {email.company && (
                                        <Chip 
                                          label={email.company}
                                          size="small"
                                          sx={{ backgroundColor: 'primary.light', color: 'primary.contrastText' }}
                                        />
                                      )}
                                    </Box>
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
                                      handleEmailSelect(email);
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

          {/* Email Preview Modal */}
          <Dialog
            open={modalOpen}
            onClose={handleCloseModal}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: { minHeight: '80vh' }
            }}
          >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1, mr: 2 }}>
                {selectedEmailForPreview?.subject || 'Email Details'}
              </Typography>
              <IconButton onClick={handleCloseModal} size="small">
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                    {selectedEmailForPreview ? (
                      <Box>
                        {/* Email Header */}
                        <Box sx={{ mb: 3 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                            <ConfidenceIndicator 
                              confidence={selectedEmailForPreview.job_probability}
                              variant="detailed"
                              size="medium"
                            />
                          </Box>

                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="body2">{selectedEmailForPreview.from_address}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="body2">
                                  Received: {new Date(selectedEmailForPreview.received_date).toLocaleString()}
                                </Typography>
                              </Box>
                              {selectedEmailForPreview.processed_at && (
                                <Typography variant="body2" sx={{ ml: 3 }}>
                                  Classified: {new Date(selectedEmailForPreview.processed_at).toLocaleString()}
                                </Typography>
                              )}
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

                        <Divider sx={{ my: 2 }} />

                        {/* Email Content Preview */}
                        <Box sx={{ mt: 3 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Email Content
                          </Typography>
                          <Paper sx={{ p: 2, backgroundColor: 'grey.50', maxHeight: 300, overflow: 'auto' }}>
                            {(() => {
                              const body = selectedEmailForPreview.body || 'Email content not available';
                              // Check if the body contains HTML
                              const isHtml = body.includes('<html') || body.includes('<!DOCTYPE') || 
                                           (body.includes('<div') && body.includes('</div>')) ||
                                           (body.includes('<p>') && body.includes('</p>')) ||
                                           (body.includes('<br') || body.includes('<table'));
                              
                              if (isHtml) {
                                // Sanitize and render HTML
                                const cleanHtml = DOMPurify.sanitize(body, {
                                  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 
                                               'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span',
                                               'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr'],
                                  ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'style'],
                                  ALLOW_DATA_ATTR: false
                                });
                                
                                return (
                                  <Box 
                                    dangerouslySetInnerHTML={{ __html: cleanHtml }}
                                    sx={{
                                      '& a': { color: 'primary.main', textDecoration: 'underline' },
                                      '& p': { margin: '0.5em 0' },
                                      '& ul, & ol': { paddingLeft: '1.5em' },
                                      '& li': { margin: '0.25em 0' },
                                      '& blockquote': { 
                                        borderLeft: '3px solid #ccc', 
                                        paddingLeft: '1em', 
                                        margin: '1em 0',
                                        color: 'text.secondary'
                                      },
                                      '& img': { maxWidth: '100%', height: 'auto' },
                                      '& table': { borderCollapse: 'collapse', width: '100%' },
                                      '& td, & th': { border: '1px solid #ddd', padding: '8px' },
                                      fontSize: '14px',
                                      lineHeight: 1.6,
                                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
                                    }}
                                  />
                                );
                              } else {
                                // Display plain text
                                return (
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                    {body}
                                  </Typography>
                                );
                              }
                            })()}
                          </Paper>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Typography variant="body2" color="text.secondary">
                          Loading email details...
                        </Typography>
                      </Box>
                    )}
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1 }}>
              {selectedEmailForPreview && (
                <>
                  <Button
                    variant="contained"
                    startIcon={<CheckCircle />}
                    onClick={() => {
                      handleBulkOperation({
                        email_ids: [selectedEmailForPreview.id],
                        operation: 'approve_as_job'
                      });
                      handleCloseModal();
                    }}
                    sx={{ 
                      backgroundColor: 'success.main',
                      '&:hover': { backgroundColor: 'success.dark' }
                    }}
                  >
                    Mark as Job-Related
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<Cancel />}
                    onClick={() => {
                      handleBulkOperation({
                        email_ids: [selectedEmailForPreview.id],
                        operation: 'reject_as_not_job'
                      });
                      handleCloseModal();
                    }}
                    sx={{ 
                      backgroundColor: 'error.main',
                      '&:hover': { backgroundColor: 'error.dark' }
                    }}
                  >
                    Mark as Not Job-Related
                  </Button>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button
                    variant="outlined"
                    onClick={handleCloseModal}
                  >
                    Close
                  </Button>
                </>
              )}
            </DialogActions>
          </Dialog>

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

        {/* Export Format Selection Dialog */}
        <Dialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Typography variant="h6" component="div">
              Select Export Format
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 3 }}>
              Choose the format for exporting your classified email data:
            </Typography>
            <Stack spacing={2}>
              <Card 
                sx={{ 
                  p: 2, 
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover'
                  }
                }}
                onClick={() => handleExportTrainingData('json')}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  JSON Format
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Complete data with all metadata, nested structure, ideal for programmatic processing
                </Typography>
              </Card>
              <Card 
                sx={{ 
                  p: 2, 
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover'
                  }
                }}
                onClick={() => handleExportTrainingData('csv')}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  CSV Format
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Simplified tabular format, easy to open in Excel, ideal for ML training
                </Typography>
              </Card>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setExportDialogOpen(false)} color="inherit">
              Cancel
            </Button>
          </DialogActions>
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