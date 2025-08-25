import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Divider,
  Paper,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Close,
  Business,
  CalendarToday,
  Email,
  Edit,
  Save,
  Cancel,
  Work,
  LocationOn
} from '@mui/icons-material';

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

interface JobDetailDialogProps {
  open: boolean;
  job: Job | null;
  onClose: () => void;
  onJobUpdate?: (updatedJob: Job) => void;
}

const statusColors: Record<string, string> = {
  Applied: '#2196F3',
  Interviewed: '#FF9800',
  Offer: '#9C27B0',
  Declined: '#F44336'
};

export const JobDetailDialog: React.FC<JobDetailDialogProps> = ({
  open,
  job,
  onClose,
  onJobUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedJob, setEditedJob] = useState<Job | null>(null);
  const [emailContent, setEmailContent] = useState<string>('');
  const [emailHistory, setEmailHistory] = useState<any[]>([]);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string>('');

  useEffect(() => {
    if (job) {
      setEditedJob({ ...job });
      loadEmailContent();
    }
  }, [job]);

  const loadEmailContent = async () => {
    if (!job?.id) return;
    
    setLoadingEmail(true);
    setEmailError('');
    
    try {
      const result = await window.electronAPI.getJobEmail(job.id);
      if (result.success) {
        setEmailContent(result.emailContent || '');
        setEmailHistory(result.emailHistory || []);
      } else {
        setEmailError(result.error || 'Failed to load email');
      }
    } catch (error) {
      console.error('Error loading email:', error);
      setEmailError('Failed to load email content');
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleSave = async () => {
    if (!editedJob || !job) return;
    
    try {
      const updates = {
        status: editedJob.status,
        notes: editedJob.notes,
        location: editedJob.location,
        salary_range: editedJob.salary_range
      };
      
      await window.electronAPI.updateJob(job.id, updates);
      
      if (onJobUpdate) {
        onJobUpdate(editedJob);
      }
      
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating job:', error);
    }
  };

  const handleCancel = () => {
    if (job) {
      setEditedJob({ ...job });
    }
    setIsEditing(false);
  };

  if (!job || !editedJob) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Business sx={{ color: 'primary.main' }} />
          <Typography variant="h6">{job.company}</Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ color: 'text.secondary' }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3 }}>
        {/* Job Details Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Work sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Typography variant="h6">{job.position}</Typography>
          </Box>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              {isEditing ? (
                <FormControl fullWidth size="small" sx={{ mt: 0.5 }}>
                  <Select
                    value={editedJob.status}
                    onChange={(e) => setEditedJob({ ...editedJob, status: e.target.value })}
                  >
                    {Object.keys(statusColors).map(status => (
                      <MenuItem key={status} value={status}>
                        <Chip
                          label={status}
                          size="small"
                          sx={{
                            backgroundColor: statusColors[status] + '20',
                            color: statusColors[status],
                            border: `1px solid ${statusColors[status]}40`
                          }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={job.status}
                    size="small"
                    sx={{
                      backgroundColor: statusColors[job.status] + '20',
                      color: statusColors[job.status],
                      border: `1px solid ${statusColors[job.status]}40`
                    }}
                  />
                </Box>
              )}
            </Box>
            
            <Box>
              <Typography variant="caption" color="text.secondary">Applied Date</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2">
                  {new Date(job.applied_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </Typography>
              </Box>
            </Box>
            
            {(job.location || isEditing) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Location</Typography>
                {isEditing ? (
                  <TextField
                    fullWidth
                    size="small"
                    value={editedJob.location || ''}
                    onChange={(e) => setEditedJob({ ...editedJob, location: e.target.value })}
                    sx={{ mt: 0.5 }}
                    placeholder="Add location..."
                  />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <LocationOn sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2">{job.location}</Typography>
                  </Box>
                )}
              </Box>
            )}
            
            {(job.salary_range || isEditing) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Salary Range</Typography>
                {isEditing ? (
                  <TextField
                    fullWidth
                    size="small"
                    value={editedJob.salary_range || ''}
                    onChange={(e) => setEditedJob({ ...editedJob, salary_range: e.target.value })}
                    sx={{ mt: 0.5 }}
                    placeholder="Add salary range..."
                  />
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{job.salary_range}</Typography>
                )}
              </Box>
            )}
          </Box>
          
          {/* Notes Section */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Notes</Typography>
            {isEditing ? (
              <TextField
                fullWidth
                multiline
                rows={3}
                value={editedJob.notes || ''}
                onChange={(e) => setEditedJob({ ...editedJob, notes: e.target.value })}
                sx={{ mt: 0.5 }}
                placeholder="Add notes..."
              />
            ) : (
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {job.notes || 'No notes added'}
              </Typography>
            )}
          </Box>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        {/* Email Content Section */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Email sx={{ color: 'primary.main' }} />
            Email Thread
          </Typography>
          
          {loadingEmail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : emailError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {emailError}
            </Alert>
          ) : emailHistory.length > 0 ? (
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {emailHistory.map((email, index) => (
                <Paper
                  key={index}
                  elevation={1}
                  sx={{
                    p: 2,
                    mb: 2,
                    backgroundColor: 'background.default',
                    borderLeft: '3px solid',
                    borderLeftColor: 'primary.main'
                  }}
                >
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      From: {email.from || 'Unknown'}
                    </Typography>
                    {email.date && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                        {new Date(email.date).toLocaleString()}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {email.subject || 'No subject'}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {email.content || email.plaintext || 'No content'}
                  </Typography>
                </Paper>
              ))}
            </Box>
          ) : emailContent ? (
            <Paper
              elevation={1}
              sx={{
                p: 2,
                backgroundColor: 'background.default',
                maxHeight: 400,
                overflow: 'auto'
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {emailContent}
              </Typography>
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No email content available
            </Typography>
          )}
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2 }}>
        {isEditing ? (
          <>
            <Button onClick={handleCancel} startIcon={<Cancel />}>
              Cancel
            </Button>
            <Button onClick={handleSave} variant="contained" startIcon={<Save />}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setIsEditing(true)} startIcon={<Edit />}>
              Edit
            </Button>
            <Button onClick={onClose} variant="contained">
              Close
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};