import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material';
import { JobRecordForm, JobFormData } from './JobRecordForm';
import { Job } from '../types/filter.types';

interface EditJobDialogProps {
  open: boolean;
  onClose: () => void;
  job: Job | null;
  onJobUpdated: (updatedJob: Job) => void;
}

export const EditJobDialog: React.FC<EditJobDialogProps> = ({
  open,
  onClose,
  job,
  onJobUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFormSubmit = async (formData: JobFormData) => {
    if (!job) return;

    try {
      setLoading(true);
      setError(null);

      // Call the enhanced edit handler
      const result = await window.electronAPI.editJob(job.id, {
        company: formData.company,
        position: formData.position,
        status: formData.status,
        location: formData.location || null,
        salary_range: formData.salary_range || null,
        notes: formData.notes || null
      });

      if (result.success && result.job) {
        setSuccess(true);
        onJobUpdated(result.job);
        
        // Show success briefly, then close
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      } else {
        throw new Error(result.message || 'Failed to update job');
      }
    } catch (err: any) {
      console.error('Error updating job:', err);
      setError(err.message || 'An unexpected error occurred while updating the job.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  const isManualEntry = job?.gmail_message_id?.startsWith('manual_');

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '70vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <EditIcon color="primary" />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Edit Job Application
        </Typography>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          disabled={loading}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {job && (
          <Box sx={{ mb: 3 }}>
            {/* Job Info Header */}
            <Box sx={{ 
              p: 2, 
              bgcolor: 'grey.50', 
              borderRadius: 1, 
              mb: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 1
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Current Job:
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {job.company} - {job.position}
                </Typography>
                {isManualEntry && (
                  <Chip
                    label="Manual Entry"
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                )}
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  Created: {new Date(job.created_at).toLocaleString()}
                </Typography>
                {job.updated_at !== job.created_at && (
                  <>
                    <Typography variant="caption" color="text.secondary">•</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Last updated: {new Date(job.updated_at).toLocaleString()}
                    </Typography>
                  </>
                )}
              </Box>

              <Typography variant="body2" color="info.main" sx={{ mt: 1 }}>
                Note: Applied date and timestamps cannot be modified for data integrity.
              </Typography>
            </Box>

            {/* Error Display */}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {/* Success Display */}
            {success && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Job updated successfully!
              </Alert>
            )}

            {/* Form */}
            <JobRecordForm
              initialData={job}
              onSubmit={handleFormSubmit}
              onCancel={handleClose}
              loading={loading}
              mode="edit"
            />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditJobDialog;