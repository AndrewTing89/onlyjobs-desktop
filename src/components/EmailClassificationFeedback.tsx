import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Box,
  Typography,
  Alert
} from '@mui/material';

interface EmailClassificationFeedbackProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (corrected: {
    emailId: string;
    isJobRelated: boolean;
    correctedType?: string;
    correctedCompany?: string;
    correctedPosition?: string;
  }) => void;
  emailId: string;
  currentClassification: {
    isJobRelated: boolean;
    company: string;
    position: string;
    jobType: string;
  };
}

export default function EmailClassificationFeedback({
  open,
  onClose,
  onSubmit,
  emailId,
  currentClassification
}: EmailClassificationFeedbackProps) {
  const [isJobRelated, setIsJobRelated] = useState(currentClassification.isJobRelated ? 'yes' : 'no');
  const [correctedCompany, setCorrectedCompany] = useState(currentClassification.company);
  const [correctedPosition, setCorrectedPosition] = useState(currentClassification.position);
  const [correctedType, setCorrectedType] = useState(currentClassification.jobType);

  const handleSubmit = () => {
    onSubmit({
      emailId,
      isJobRelated: isJobRelated === 'yes',
      correctedType: isJobRelated === 'yes' ? correctedType : undefined,
      correctedCompany: isJobRelated === 'yes' ? correctedCompany : undefined,
      correctedPosition: isJobRelated === 'yes' ? correctedPosition : undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Provide Classification Feedback</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Your feedback helps improve the ML model's accuracy over time.
        </Alert>

        <Box sx={{ mt: 2 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Is this email job-related?</FormLabel>
            <RadioGroup
              value={isJobRelated}
              onChange={(e) => setIsJobRelated(e.target.value)}
            >
              <FormControlLabel value="yes" control={<Radio />} label="Yes, it's job-related" />
              <FormControlLabel value="no" control={<Radio />} label="No, it's not job-related" />
            </RadioGroup>
          </FormControl>

          {isJobRelated === 'yes' && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Correct the details if needed:
              </Typography>
              
              <TextField
                fullWidth
                label="Company"
                value={correctedCompany}
                onChange={(e) => setCorrectedCompany(e.target.value)}
                margin="normal"
                helperText="Leave empty if unknown"
              />
              
              <TextField
                fullWidth
                label="Position"
                value={correctedPosition}
                onChange={(e) => setCorrectedPosition(e.target.value)}
                margin="normal"
                helperText="Leave empty if unknown"
              />
              
              <FormControl fullWidth margin="normal">
                <FormLabel>Job Type</FormLabel>
                <RadioGroup
                  value={correctedType}
                  onChange={(e) => setCorrectedType(e.target.value)}
                >
                  <FormControlLabel value="Applied" control={<Radio />} label="Applied" />
                  <FormControlLabel value="Interviewed" control={<Radio />} label="Interview" />
                  <FormControlLabel value="Offer" control={<Radio />} label="Offer" />
                  <FormControlLabel value="Declined" control={<Radio />} label="Declined/Rejected" />
                </RadioGroup>
              </FormControl>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          Submit Feedback
        </Button>
      </DialogActions>
    </Dialog>
  );
}