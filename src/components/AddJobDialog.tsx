import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Alert,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  InfoOutlined as InfoIcon
} from '@mui/icons-material';
import { JobRecordForm, JobFormData } from './JobRecordForm';
import { Job } from '../types/filter.types';

interface AddJobDialogProps {
  open: boolean;
  onClose: () => void;
  onJobCreated: (newJob: Job) => void;
}

export const AddJobDialog: React.FC<AddJobDialogProps> = ({
  open,
  onClose,
  onJobCreated
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFormSubmit = async (formData: JobFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Call the manual job creation handler
      const result = await window.electronAPI.createManualJob({
        company: formData.company,
        position: formData.position,
        status: formData.status,
        applied_date: formData.applied_date,
        location: formData.location || null,
        salary_range: formData.salary_range || null,
        notes: formData.notes || null
      });

      if (result.success && result.job) {
        setSuccess(true);
        onJobCreated(result.job);
        
        // Show success briefly, then close
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      } else {
        throw new Error('Failed to create job');
      }
    } catch (err: any) {
      console.error('Error creating job:', err);
      setError(err.message || 'An unexpected error occurred while creating the job.');
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
        <AddIcon color="primary" />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Add Job Application
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
        <Box sx={{ mb: 3 }}>
          {/* Info Section */}
          <Box sx={{ 
            p: 2, 
            bgcolor: 'info.light', 
            borderRadius: 1, 
            mb: 3,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1
          }}>
            <InfoIcon fontSize="small" sx={{ color: 'info.main', mt: 0.25 }} />
            <Box>
              <Typography variant="body2" color="info.main" fontWeight="medium" gutterBottom>
                Manual Job Entry
              </Typography>
              <Typography variant="body2" color="info.main">
                Use this form to add job applications that weren't automatically detected by email sync. 
                Manual entries will be marked with a 
                <Chip 
                  label="Manual Entry" 
                  size="small" 
                  color="secondary" 
                  variant="outlined" 
                  sx={{ mx: 0.5, height: 18 }}
                /> 
                badge.
              </Typography>
            </Box>
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
              Job application added successfully!
            </Alert>
          )}

          {/* Form */}
          <JobRecordForm
            onSubmit={handleFormSubmit}
            onCancel={handleClose}
            loading={loading}
            mode="create"
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AddJobDialog;