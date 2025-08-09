import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
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
  InputAdornment,
  FormControl,
  Select,
  SelectChangeEvent
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
import { onlyJobsClient, type JobEmail, type EmailDetail } from '../lib/onlyjobsClient';

const accent = "#FF7043";

const statusColors: Record<string, string> = {
  Applied: '#2196F3',
  Interview: '#FF9800', 
  Declined: '#F44336',
  Offer: '#4CAF50'
};

export interface JobsListRef {
  refresh: () => Promise<void>;
}

const JobsList = forwardRef<JobsListRef>((props, ref) => {
  const [jobs, setJobs] = useState<JobEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Applied' | 'Interview' | 'Declined' | 'Offer' | ''>('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJob, setSelectedJob] = useState<JobEmail | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  useImperativeHandle(ref, () => ({
    refresh: loadJobs
  }));

  const loadJobs = async () => {
    try {
      setLoading(true);
      const result = await onlyJobsClient.fetchJobInbox({
        status: statusFilter || undefined,
        limit: 100
      });
      console.log('Loaded jobs:', result); // Debug log
      setJobs(result.rows);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, job: JobEmail) => {
    setAnchorEl(event.currentTarget);
    setSelectedJob(job);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedJob(null);
  };

  const handleViewEmail = async (job: JobEmail) => {
    try {
      const detail = await onlyJobsClient.fetchEmailDetail(job.gmail_message_id);
      console.log('Fetched email detail:', detail); // Debug log
      setEmailDetail(detail);
      setEmailModalOpen(true);
    } catch (error) {
      console.error('Error fetching email details:', error);
      setError('Failed to load email details');
    }
  };

  const handleStatusFilterChange = (event: SelectChangeEvent<string>) => {
    setStatusFilter(event.target.value as 'Applied' | 'Interview' | 'Declined' | 'Offer' | '');
  };

  const filteredJobs = jobs.filter(job => {
    const companyMatch = job.company?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const positionMatch = job.position?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    return companyMatch || positionMatch;
  });

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
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  displayEmpty
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="Applied">Applied</MenuItem>
                  <MenuItem value="Interview">Interview</MenuItem>
                  <MenuItem value="Declined">Declined</MenuItem>
                  <MenuItem value="Offer">Offer</MenuItem>
                </Select>
              </FormControl>
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
                  key={job.gmail_message_id} 
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <Email sx={{ fontSize: 14, color: 'primary.main' }} />
                          <Typography variant="body2" color="primary.main">
                            {job.from_email}
                          </Typography>
                        </Box>
                      </Box>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                      <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          {job.status && (
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
                          )}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                              {new Date(job.message_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Typography>
                          </Box>
                        </Box>
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
          <Typography variant="caption">Job Actions</Typography>
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          View Details
        </MenuItem>
      </Menu>

      {emailModalOpen && emailDetail && (
        <EmailViewModal
          open={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false);
            setEmailDetail(null);
          }}
          emailContent={emailDetail.body?.body_plain || emailDetail.body?.body_excerpt || ''}
          job={{
            company: emailDetail.meta.company || 'Unknown',
            position: emailDetail.meta.position || 'Unknown',
            applied_date: new Date(emailDetail.meta.message_date).toISOString(),
            from_address: emailDetail.meta.from_email,
            raw_content: emailDetail.body?.body_plain || emailDetail.body?.body_html || ''
          }}
        />
      )}
    </Box>
  );
});

export default JobsList;