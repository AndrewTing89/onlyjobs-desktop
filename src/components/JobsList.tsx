import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  Menu,
  MenuItem,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  MoreVert,
  Business,
  CalendarToday,
  Email,
  Search,
  Refresh,
  Visibility,
  Feedback
} from '@mui/icons-material';
import { LoadingSpinner } from './LoadingSpinner';
import { EmailViewer } from './EmailViewer';
import EmailClassificationFeedback from './EmailClassificationFeedback';

const accent = "#FF7043";

interface Job {
  id: string;
  company: string;
  position: string;
  status: string;
  job_type?: string;
  applied_date: string;
  location?: string;
  salary_range?: string;
  notes?: string;
  email_id?: string;
  created_at: string;
  updated_at: string;
  account_email?: string;
  from_address?: string;
  raw_content?: string;
}

const statusColors: Record<string, string> = {
  Applied: '#2196F3',
  Interviewed: '#FF9800', 
  Offer: '#9C27B0',
  Declined: '#F44336'
};

// Job type labels are no longer needed since we use status directly

interface JobsListProps {
  jobs?: Job[];
  modelId?: string;
}

export default function JobsList({ jobs: propJobs, modelId }: JobsListProps = {}) {
  console.log(`[JobsList] Initializing with propJobs:`, propJobs?.length ?? 'undefined', 'jobs', propJobs);
  // CRITICAL: Ensure clean initialization, especially when modelId is present
  const initialJobs = propJobs !== undefined ? [...propJobs] : [];
  console.log(`[JobsList] Setting initial state to:`, initialJobs, 'modelId:', modelId);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [loading, setLoading] = useState(!propJobs);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [emailViewerOpen, setEmailViewerOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState<Job | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackJob, setFeedbackJob] = useState<Job | null>(null);

  useEffect(() => {
    // Only load jobs if not provided as props
    if (propJobs === undefined) {
      console.log('[JobsList] No props provided, loading jobs from database');
      loadJobs();
    } else {
      console.log('[JobsList] Using jobs from props:', propJobs.length);
    }
    loadSyncStatus();
    
    // Listen for individual job additions during sync
    const handleJobFound = (newJob: Job) => {
      setJobs(prevJobs => {
        // Check if job already exists to avoid duplicates
        const existingJob = prevJobs.find(job => job.id === newJob.id);
        if (existingJob) {
          return prevJobs;
        }
        
        // Insert the new job and maintain proper date ordering (newest first)
        const updatedJobs = [...prevJobs, newJob];
        return updatedJobs.sort((a, b) => {
          // First sort by applied_date (newest first)
          const dateA = new Date(a.applied_date);
          const dateB = new Date(b.applied_date);
          if (dateB.getTime() !== dateA.getTime()) {
            return dateB.getTime() - dateA.getTime();
          }
          // If dates are equal, sort by created_at (newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
    };
    
    // Listen for sync completion and reload jobs (as backup)
    const handleSyncComplete = () => {
      console.log('[JobsList] Sync completed');
      if (propJobs === undefined) {
        console.log('[JobsList] Reloading jobs from database after sync');
        loadJobs();
      }
      loadSyncStatus();
    };
    
    // Only listen for events if we're managing our own jobs (not using props)
    // SAFEGUARD: Also skip if modelId is present to prevent cross-contamination
    if (propJobs === undefined && !modelId) {
      console.log('[JobsList] Setting up event listeners (self-managed mode)');
      window.electronAPI.on('job-found', handleJobFound);
      window.electronAPI.onSyncComplete(handleSyncComplete);
    } else {
      console.log('[JobsList] Skipping event listeners (managed by parent or in model context)');
    }
    
    return () => {
      // Clean up listeners if they exist
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener('job-found', handleJobFound);
        window.electronAPI.removeListener('sync-complete', handleSyncComplete);
      }
    };
  }, [propJobs]);
  
  // Update jobs when props change
  useEffect(() => {
    if (propJobs !== undefined) {
      console.log(`[JobsList] Props changed - setting jobs to:`, propJobs.length, 'jobs');
      // CRITICAL: Force complete state reset, especially for empty arrays
      if (propJobs.length === 0) {
        console.log('[JobsList] Forcing complete state reset for empty props');
        setJobs([]); // Explicitly set to empty
        setLoading(false);
        setError('');
        setSearchTerm('');
        return;
      }
      // Force state update even if it's an empty array
      setJobs([...propJobs]); // Create new array reference
      setLoading(false);
    }
  }, [propJobs]);

  const loadJobs = async () => {
    // SAFEGUARD: Never load from main table if we're in a model context
    if (modelId) {
      console.warn('[JobsList] Attempted to load jobs with modelId present - blocking to prevent cross-contamination');
      return;
    }
    
    try {
      setLoading(true);
      const result = await window.electronAPI.getJobs();
      // console.log('Loaded jobs:', result); // Debug log
      setJobs(result);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const status = await window.electronAPI.gmail.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error loading sync status:', error);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, job: Job) => {
    setAnchorEl(event.currentTarget);
    setSelectedJob(job);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedJob(null);
  };
  
  const handleViewEmail = (job: Job) => {
    setViewingJob(job);
    setEmailViewerOpen(true);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedJob) return;
    
    try {
      await window.electronAPI.updateJob(selectedJob.id, { status: newStatus });
      setJobs(jobs.map(j => 
        j.id === selectedJob.id ? { ...j, status: newStatus } : j
      ));
    } catch (error) {
      console.error('Error updating job:', error);
    }
    
    handleMenuClose();
  };

  const handleDelete = async () => {
    if (!selectedJob) return;
    
    try {
      await window.electronAPI.deleteJob(selectedJob.id);
      setJobs(jobs.filter(j => j.id !== selectedJob.id));
    } catch (error) {
      console.error('Error deleting job:', error);
    }
    
    handleMenuClose();
  };

  const handleFeedbackClick = (job: Job) => {
    setFeedbackJob(job);
    setFeedbackDialogOpen(true);
  };

  const handleFeedbackSubmit = async (corrected: any) => {
    try {
      // Submit feedback to ML model
      await window.electronAPI.ml.submitFeedback({
        emailId: corrected.emailId,
        isJobRelated: corrected.isJobRelated,
        correctedType: corrected.correctedType,
        correctedCompany: corrected.correctedCompany,
        correctedPosition: corrected.correctedPosition
      });

      // Update the job in the UI if needed
      if (corrected.isJobRelated && feedbackJob) {
        setJobs(jobs.map(j => 
          j.id === feedbackJob.id 
            ? { 
                ...j, 
                company: corrected.correctedCompany || j.company,
                position: corrected.correctedPosition || j.position
              } 
            : j
        ));
      }

      // Close the dialog
      setFeedbackDialogOpen(false);
      setFeedbackJob(null);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  // Email viewing removed since we no longer store raw content

  const filteredJobs = jobs.filter(job => 
    (job.company || 'Unknown Company').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.position || 'Unknown Position').toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Debug logging
  console.log('[JobsList] Current jobs state:', jobs);
  console.log('[JobsList] Filtered jobs:', filteredJobs);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <LoadingSpinner variant="dots" size="medium" />
      </Box>
    );
  }

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Job Applications</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {syncStatus && (
                <Typography variant="body2" color="text.secondary">
                  {syncStatus.last_sync_time ? 
                    `Last sync: ${new Date(syncStatus.last_sync_time).toLocaleString()}` : 
                    'Not synced yet'}
                  {syncStatus.total_jobs_found && ` • ${syncStatus.total_jobs_found} jobs found`}
                </Typography>
              )}
              <IconButton size="small" onClick={loadJobs} title="Refresh">
                <Refresh />
              </IconButton>
            </Box>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input-focus"
            sx={{ 
              mb: 2,
              '& .MuiOutlinedInput-root': {
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                '&:hover': {
                  boxShadow: '0 2px 8px rgba(255, 112, 67, 0.1)',
                },
                '&.Mui-focused': {
                  boxShadow: '0 0 0 3px rgba(255, 112, 67, 0.2)',
                  transform: 'scale(1.01)',
                },
              },
              '& .MuiInputAdornment-root .MuiSvgIcon-root': {
                transition: 'color 0.3s ease',
                color: searchTerm ? 'primary.main' : 'text.secondary',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          {error && (
            <Alert 
              severity="error" 
              className="notification-enter notification-error"
              sx={{ 
                mb: 2,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }} 
              onClose={() => setError('')}
            >
              {error}
            </Alert>
          )}

          {filteredJobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center">
              No jobs found. Sync your Gmail to discover job applications!
            </Typography>
          ) : (
            <List sx={{ py: 0 }}>
              {filteredJobs.map((job, index) => (
                <ListItem 
                  key={job.id} 
                  sx={{ 
                    py: 2.5,
                    px: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    mb: 0.5,
                    opacity: 0,
                    animation: 'staggerFadeInUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                    animationDelay: `${index * 50}ms`,
                    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    position: 'relative',
                    cursor: 'pointer',
                    backgroundColor: 'background.paper',
                    '&:hover': {
                      transform: 'translateX(4px)',
                      boxShadow: '0 2px 8px rgba(255, 112, 67, 0.15)',
                      backgroundColor: 'action.hover',
                      '& .job-status-chip': {
                        transform: 'scale(1.05)',
                      },
                    }
                  }}
                  onClick={() => handleViewEmail(job)}
                >
                  <ListItemText
                    primary={
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Business sx={{ fontSize: 18, color: accent }} />
                            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 500 }}>
                              {job.company || 'Unknown Company'}
                            </Typography>
                          </Box>
                          <Typography variant="body1" color="text.secondary">
                            {job.position || 'Unknown Position'}
                          </Typography>
                        </Box>
                        {job.from_address && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                            <Email sx={{ fontSize: 14, color: 'primary.main' }} />
                            <Typography variant="body2" color="primary.main">
                              {job.from_address}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                      <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={job.status}
                            size="small"
                            className="job-status-chip"
                            sx={{
                              backgroundColor: statusColors[job.status] + '20',
                              color: statusColors[job.status],
                              border: `1px solid ${statusColors[job.status]}40`,
                              fontWeight: 500,
                              transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                            }}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                              {job.applied_date && !isNaN(new Date(job.applied_date).getTime()) 
                                ? new Date(job.applied_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })
                                : 'No date'
                              }
                            </Typography>
                          </Box>
                        </Box>
                        {job.account_email && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Received at: {job.account_email}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewEmail(job);
                        }}
                        size="small"
                        title="View Email"
                        sx={{
                          color: 'primary.main',
                          '&:hover': {
                            backgroundColor: 'primary.main',
                            color: 'white',
                          }
                        }}
                      >
                        <Visibility />
                      </IconButton>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedbackClick(job);
                        }}
                        size="small"
                        title="Provide Feedback"
                        sx={{
                          color: 'secondary.main',
                          '&:hover': {
                            backgroundColor: 'secondary.main',
                            color: 'white',
                          }
                        }}
                      >
                        <Feedback />
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e, job);
                        }}
                      >
                        <MoreVert />
                      </IconButton>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem dense disabled>
          <Typography variant="caption">Change Status</Typography>
        </MenuItem>
        {Object.entries(statusColors).map(([status, color]) => (
          <MenuItem
            key={status}
            onClick={() => handleStatusChange(status)}
            selected={selectedJob?.status === status}
          >
            <Chip
              label={status}
              size="small"
              sx={{
                backgroundColor: color + '20',
                color: color,
                border: `1px solid ${color}40`
              }}
            />
          </MenuItem>
        ))}
        <MenuItem divider />
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>

      {viewingJob && (
        <EmailViewer
          open={emailViewerOpen}
          onClose={() => {
            setEmailViewerOpen(false);
            setViewingJob(null);
          }}
          jobId={viewingJob.id}
          jobTitle={`${viewingJob.company} - ${viewingJob.position}`}
        />
      )}

      {feedbackJob && (
        <EmailClassificationFeedback
          open={feedbackDialogOpen}
          onClose={() => {
            setFeedbackDialogOpen(false);
            setFeedbackJob(null);
          }}
          onSubmit={handleFeedbackSubmit}
          emailId={feedbackJob.email_id || ''}
          currentClassification={{
            isJobRelated: true,
            company: feedbackJob.company || '',
            position: feedbackJob.position || '',
            jobType: feedbackJob.status || 'Applied'
          }}
        />
      )}

    </Box>
  );
}