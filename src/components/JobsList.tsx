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
  Refresh
} from '@mui/icons-material';

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

export default function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  useEffect(() => {
    loadJobs();
    loadSyncStatus();
    
    // Listen for individual job additions during sync
    const handleJobFound = (newJob: Job) => {
      console.log('New job found during sync:', newJob);
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
      console.log('Sync completed, reloading jobs from database');
      loadJobs();
      loadSyncStatus();
    };
    
    window.electronAPI.on('job-found', handleJobFound);
    window.electronAPI.onSyncComplete(handleSyncComplete);
    
    return () => {
      // Clean up listeners if they exist
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener('job-found', handleJobFound);
        window.electronAPI.removeListener('sync-complete', handleSyncComplete);
      }
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

  // Email viewing removed since we no longer store raw content

  const filteredJobs = jobs.filter(job => 
    (job.company || 'Unknown Company').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.position || 'Unknown Position').toLowerCase().includes(searchTerm.toLowerCase())
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
                            sx={{
                              backgroundColor: statusColors[job.status] + '20',
                              color: statusColors[job.status],
                              border: `1px solid ${statusColors[job.status]}40`,
                              fontWeight: 500
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
                    <IconButton
                      edge="end"
                      onClick={(e) => handleMenuOpen(e, job)}
                    >
                      <MoreVert />
                    </IconButton>
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

    </Box>
  );
}