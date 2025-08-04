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
  CircularProgress,
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
  Visibility
} from '@mui/icons-material';
import { EmailViewModal } from './EmailViewModal';

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
  ml_confidence?: number;
  created_at: string;
  updated_at: string;
  account_email?: string;
  from_address?: string;
  raw_content?: string;
}

const statusColors: Record<string, string> = {
  active: '#4CAF50',
  applied: '#2196F3',
  interviewing: '#FF9800',
  offered: '#9C27B0',
  rejected: '#F44336',
  withdrawn: '#9E9E9E'
};

const jobTypeLabels: Record<string, string> = {
  application_sent: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejection: 'Rejected',
  follow_up: 'Follow-up'
};

export default function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState<Job | null>(null);

  useEffect(() => {
    loadJobs();
    loadSyncStatus();
    
    // Listen for new jobs
    const handleJobFound = (job: Job) => {
      setJobs(prev => [job, ...prev]);
    };
    
    window.electronAPI.on('job-found', handleJobFound);
    
    return () => {
      window.electronAPI.removeListener('job-found', handleJobFound);
    };
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getJobs();
      console.log('Loaded jobs:', result); // Debug log
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

  const handleViewEmail = async (job: Job) => {
    // Always fetch the full job details to ensure we have the email content
    try {
      const fullJob = await window.electronAPI.getJob(job.id);
      console.log('Fetched job details:', fullJob); // Debug log
      console.log('Raw content exists:', !!fullJob?.raw_content);
      console.log('Raw content length:', fullJob?.raw_content?.length);
      console.log('Raw content preview:', fullJob?.raw_content?.substring(0, 100));
      setViewingJob(fullJob);
    } catch (error) {
      console.error('Error fetching job details:', error);
      setViewingJob(job);
    }
    setEmailModalOpen(true);
  };

  const filteredJobs = jobs.filter(job => 
    job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
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
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {filteredJobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center">
              No jobs found. Sync your Gmail to discover job applications!
            </Typography>
          ) : (
            <List sx={{ py: 0 }}>
              {filteredJobs.map((job) => (
                <ListItem 
                  key={job.id} 
                  sx={{ 
                    py: 2.5,
                    px: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    }
                  }}
                >
                  <ListItemText
                    primary={
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Business sx={{ fontSize: 18, color: accent }} />
                            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 500 }}>
                              {job.company}
                            </Typography>
                          </Box>
                          <Typography variant="body1" color="text.secondary">
                            {job.position}
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
                    secondary={
                      <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={job.status}
                            size="small"
                            sx={{
                              backgroundColor: statusColors[job.status] + '20',
                              color: statusColors[job.status],
                              border: `1px solid ${statusColors[job.status]}40`,
                              fontWeight: 500
                            }}
                          />
                          {job.job_type && (
                            <Chip
                              label={jobTypeLabels[job.job_type] || job.job_type}
                              size="small"
                              variant="outlined"
                              color="primary"
                            />
                          )}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                              {new Date(job.applied_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Typography>
                          </Box>
                          {job.ml_confidence && (
                            <Typography variant="body2" color="text.secondary">
                              {Math.round(job.ml_confidence * 100)}% match
                            </Typography>
                          )}
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
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton
                        edge="end"
                        onClick={() => handleViewEmail(job)}
                        title="View Email"
                        sx={{ mr: 1 }}
                      >
                        <Visibility />
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={(e) => handleMenuOpen(e, job)}
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

      {emailModalOpen && viewingJob && (
        <EmailViewModal
          open={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setViewingJob(null);
          }}
          emailContent={viewingJob.raw_content || ''}
          job={viewingJob}
        />
      )}
    </Box>
  );
}