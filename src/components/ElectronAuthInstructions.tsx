import React from 'react';
import { 
  Box, 
  Typography, 
  Alert, 
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Card,
  CardContent 
} from '@mui/material';
import { Google } from '@mui/icons-material';

interface ElectronAuthInstructionsProps {
  onStartAuth: () => void;
  loading: boolean;
}

const ElectronAuthInstructions: React.FC<ElectronAuthInstructionsProps> = ({ 
  onStartAuth, 
  loading 
}) => {
  const steps = [
    {
      label: 'Click "Continue with Google" below',
      description: 'This will open your web browser for secure Google authentication.'
    },
    {
      label: 'Sign in with Google in your browser',
      description: 'Complete the Google OAuth process in the browser window that opens.'
    },
    {
      label: 'Return to this desktop app',
      description: 'After successful authentication, return here and sign in with the same Google account credentials (email/password).'
    },
    {
      label: 'Access your dashboard',
      description: 'You\'ll be automatically redirected to your job tracking dashboard.'
    }
  ];

  return (
    <Card sx={{ bgcolor: '#f8f9fa', borderRadius: 3, mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, color: '#FF7043', fontWeight: 600 }}>
          Desktop App Authentication
        </Typography>
        
        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          For security reasons, Google OAuth requires authentication in your web browser. 
          Follow these simple steps to sign in:
        </Alert>

        <Stepper orientation="vertical" sx={{ mb: 3 }}>
          {steps.map((step, index) => (
            <Step key={index} active={true}>
              <StepLabel>
                <Typography variant="body1" sx={{ fontWeight: 500, color: '#333' }}>
                  {step.label}
                </Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                  {step.description}
                </Typography>
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={onStartAuth}
          disabled={loading}
          startIcon={<Google />}
          sx={{
            background: '#FF7043',
            borderRadius: 2,
            py: 1.5,
            fontSize: 16,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': {
              background: '#F4511E',
              boxShadow: 'none',
            },
          }}
        >
          {loading ? 'Opening Browser...' : 'Continue with Google'}
        </Button>

        <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', mt: 2 }}>
          This is a one-time setup. Future logins will be faster.
        </Typography>
      </CardContent>
    </Card>
  );
};

export default ElectronAuthInstructions;