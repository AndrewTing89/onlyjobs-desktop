import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  IconButton,
  Paper
} from '@mui/material';
import {
  Close as CloseIcon,
  Email as EmailIcon,
  CalendarToday as CalendarTodayIcon,
  Business as BusinessIcon,
  Work as WorkIcon
} from '@mui/icons-material';

interface EmailViewModalProps {
  open: boolean;
  onClose: () => void;
  emailContent: string;
  job: {
    company: string;
    position: string;
    from_address?: string;
    applied_date: string;
    job_type?: string;
    ml_confidence?: number;
    raw_content?: string; // Add this field
  };
}

export const EmailViewModal: React.FC<EmailViewModalProps> = ({
  open,
  onClose,
  emailContent,
  job
}) => {
  // Use emailContent prop, or fallback to job.raw_content
  const actualContent = emailContent || job.raw_content || '';
  
  // Parse email content to extract parts
  const parseEmailContent = (content: string) => {
    if (!content || content.trim() === '') {
      return {
        from: job.from_address || 'Unknown Sender',
        subject: 'No Subject',
        body: 'Email content not available'
      };
    }
    
    const fromMatch = content.match(/From:\s*([^\n]+)/i);
    const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
    const bodyStart = content.indexOf('\n\n');
    
    let body = bodyStart > -1 ? content.substring(bodyStart + 2) : content;
    
    // Clean up the body text for better display
    body = body
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
      .trim();
    
    return {
      from: fromMatch ? fromMatch[1] : (job.from_address || 'Unknown Sender'),
      subject: subjectMatch ? subjectMatch[1] : 'No Subject',
      body
    };
  };

  const { from, subject, body } = parseEmailContent(actualContent);

  // Debug logging
  console.log('Email Modal Props:', { 
    emailContent: emailContent?.length, 
    actualContent: actualContent?.length,
    actualContentPreview: actualContent?.substring(0, 100),
    job,
    hasEmailContent: !!emailContent,
    hasActualContent: !!actualContent
  });


  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '70vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Email Details</Typography>
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Job Information */}
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BusinessIcon fontSize="small" color="action" />
              <Typography variant="subtitle1">{job.company}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WorkIcon fontSize="small" color="action" />
              <Typography variant="subtitle1">{job.position}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarTodayIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {new Date(job.applied_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Typography>
            </Box>
          </Box>
          {job.job_type && (
            <Chip
              label={job.job_type.replace('_', ' ')}
              size="small"
              sx={{ mr: 1 }}
            />
          )}
          {job.ml_confidence && (
            <Chip
              label={`${Math.round(job.ml_confidence * 100)}% confidence`}
              size="small"
              variant="outlined"
            />
          )}
        </Paper>

        {/* Email Headers */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <EmailIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">From:</Typography>
            <Typography variant="body2">{from}</Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">Subject:</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              {subject}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Email Body */}
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Email Content:
          </Typography>
          <Paper 
            sx={{ 
              p: 2, 
              bgcolor: 'grey.50',
              maxHeight: '400px',
              overflow: 'auto',
              minHeight: '100px',
              '& pre': {
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                margin: 0
              }
            }}
          >
            {actualContent ? (
              <pre>{body}</pre>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Loading email content...
              </Typography>
            )}
          </Paper>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};