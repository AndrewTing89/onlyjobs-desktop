import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  Chip
} from '@mui/material';
import { Feedback, CheckCircle, Warning } from '@mui/icons-material';

interface ClassificationData {
  emailId: string;
  subject: string;
  from: string;
  currentType: string;
  currentCompany: string | null;
  currentPosition: string | null;
  confidence: number;
}

interface EmailClassificationFeedbackProps {
  open: boolean;
  onClose: () => void;
  classification: ClassificationData;
  onSubmitFeedback: (corrected: any) => void;
}

const EMAIL_TYPES = [
  { value: 'application_confirmation', label: 'Application Confirmation' },
  { value: 'interview_request', label: 'Interview Request' },
  { value: 'offer', label: 'Job Offer' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'application_sent', label: 'Application Sent' },
  { value: 'not_job_related', label: 'Not Job Related' }
];

export default function EmailClassificationFeedback({
  open,
  onClose,
  classification,
  onSubmitFeedback
}: EmailClassificationFeedbackProps) {
  const [correctedType, setCorrectedType] = useState(classification.currentType);
  const [correctedCompany, setCorrectedCompany] = useState(classification.currentCompany || '');
  const [correctedPosition, setCorrectedPosition] = useState(classification.currentPosition || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleTypeChange = (value: string) => {
    setCorrectedType(value);
    setHasChanges(true);
  };

  const handleCompanyChange = (value: string) => {
    setCorrectedCompany(value);
    setHasChanges(true);
  };

  const handlePositionChange = (value: string) => {
    setCorrectedPosition(value);
    setHasChanges(true);
  };

  const handleSubmit = () => {
    if (hasChanges) {
      onSubmitFeedback({
        emailId: classification.emailId,
        correctedType,
        correctedCompany: correctedCompany || null,
        correctedPosition: correctedPosition || null,
        isJobRelated: correctedType !== 'not_job_related'
      });
    }
    onClose();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Feedback />
        Improve Email Classification
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Help us improve our AI by correcting any misclassifications
          </Typography>
          
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Email Details:
            </Typography>
            <Typography variant="body2">
              <strong>Subject:</strong> {classification.subject}
            </Typography>
            <Typography variant="body2">
              <strong>From:</strong> {classification.from}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Chip 
                size="small" 
                label={`Confidence: ${(classification.confidence * 100).toFixed(0)}%`}
                color={getConfidenceColor(classification.confidence)}
                icon={classification.confidence >= 0.8 ? <CheckCircle /> : <Warning />}
              />
            </Box>
          </Box>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Email Type</InputLabel>
          <Select
            value={correctedType}
            onChange={(e) => handleTypeChange(e.target.value)}
            label="Email Type"
          >
            {EMAIL_TYPES.map(type => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
                {type.value === classification.currentType && ' (Current)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {correctedType !== 'not_job_related' && (
          <>
            <TextField
              fullWidth
              label="Company Name"
              value={correctedCompany}
              onChange={(e) => handleCompanyChange(e.target.value)}
              placeholder="e.g., Google, Microsoft, Apple"
              sx={{ mb: 2 }}
              helperText={!classification.currentCompany ? "No company detected" : ""}
            />

            <TextField
              fullWidth
              label="Position/Job Title"
              value={correctedPosition}
              onChange={(e) => handlePositionChange(e.target.value)}
              placeholder="e.g., Software Engineer, Product Manager"
              helperText={!classification.currentPosition ? "No position detected" : ""}
            />
          </>
        )}

        {hasChanges && (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="body2" color="info.dark">
              Your feedback will help improve future classifications
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={!hasChanges}
        >
          Submit Feedback
        </Button>
      </DialogActions>
    </Dialog>
  );
}