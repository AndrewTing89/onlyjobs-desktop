import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
  CircularProgress
} from '@mui/material';
import { Send, Psychology, CheckCircle, Cancel } from '@mui/icons-material';
import MLModelStatus from '../components/MLModelStatus';

// Remove this declaration - it's already defined elsewhere

interface ClassificationResult {
  is_job_related: boolean;
  confidence: number;
  probabilities: {
    non_job_related: number;
    job_related: number;
  };
  job_type?: string;
  company?: string;
  position?: string;
  model_version?: string;
  processed_at?: string;
  fallback_reason?: string;
}

const MLTestPage: React.FC = () => {
  const [emailContent, setEmailContent] = useState('');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testEmails = [
    {
      label: 'Job Application Confirmation',
      content: `Thank you for your interest in the Software Engineer position at TechCorp. We have received your application and will review it carefully. Our hiring team will be in touch within the next 2-3 business days to discuss next steps.

Best regards,
HR Team
TechCorp Inc.`
    },
    {
      label: 'Interview Invitation',
      content: `Hi John,

We were impressed with your application for the Frontend Developer role. We would like to schedule a phone interview with you next week. 

Are you available Tuesday at 2 PM or Wednesday at 10 AM?

Looking forward to speaking with you.

Sarah Johnson
Senior Recruiter
InnovateTech`
    },
    {
      label: 'Non-Job Email (Shopping)',
      content: `Your Amazon order has been shipped!

Order #123-456789

Items:
- Wireless Headphones
- USB Cable

Expected delivery: Tomorrow by 8 PM

Track your package: [link]

Thanks for choosing Amazon!`
    },
    {
      label: 'Job Rejection',
      content: `Dear Candidate,

Thank you for your time and interest in the Marketing Manager position at CreativeAgency. After careful consideration, we have decided to move forward with another candidate whose experience more closely matches our current needs.

We wish you the best in your job search.

Best regards,
Hiring Team`
    }
  ];

  const classifyEmail = async (content: string) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const classification = await window.electronAPI.classifyEmail(content);
      setResult(classification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailContent.trim()) {
      classifyEmail(emailContent.trim());
    }
  };

  const loadTestEmail = (content: string) => {
    setEmailContent(content);
    setResult(null);
    setError(null);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom display="flex" alignItems="center" gap={2}>
        <Psychology color="primary" />
        ML Model Testing
      </Typography>
      
      <Typography variant="body1" color="textSecondary" gutterBottom>
        Test the email classification model with sample content or your own text.
      </Typography>

      <Stack spacing={3} sx={{ mt: 3 }}>
        {/* ML Model Status */}
        <MLModelStatus />

        {/* Test Email Samples */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Test Email Samples
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
              {testEmails.map((email, index) => (
                <Button
                  key={index}
                  variant="outlined"
                  size="small"
                  onClick={() => loadTestEmail(email.content)}
                >
                  {email.label}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Email Input */}
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Typography variant="h6">
                Email Content to Classify
              </Typography>
              
              <TextField
                multiline
                rows={8}
                fullWidth
                placeholder="Paste email content here..."
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                variant="outlined"
              />
              
              <Button
                type="submit"
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                disabled={loading || !emailContent.trim()}
                sx={{ alignSelf: 'flex-start' }}
              >
                {loading ? 'Classifying...' : 'Classify Email'}
              </Button>
            </Stack>
          </form>
        </Paper>

        {/* Error Display */}
        {error && (
          <Alert severity="error">
            Classification Error: {error}
          </Alert>
        )}

        {/* Results Display */}
        {result && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                Classification Result
                {result.is_job_related ? (
                  <CheckCircle color="success" />
                ) : (
                  <Cancel color="error" />
                )}
              </Typography>

              <Stack spacing={2}>
                {/* Main Classification */}
                <Box>
                  <Chip
                    icon={result.is_job_related ? <CheckCircle /> : <Cancel />}
                    label={result.is_job_related ? 'JOB-RELATED' : 'NOT JOB-RELATED'}
                    color={result.is_job_related ? 'success' : 'error'}
                    variant="filled"
                    size="medium"
                    sx={{ fontSize: '1.1rem', padding: '20px 16px' }}
                  />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Confidence: {(result.confidence * 100).toFixed(1)}%
                  </Typography>
                </Box>

                <Divider />

                {/* Probabilities */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Probabilities
                  </Typography>
                  <Stack spacing={1}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">Job-related:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {(result.probabilities.job_related * 100).toFixed(1)}%
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">Non-job-related:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="error.main">
                        {(result.probabilities.non_job_related * 100).toFixed(1)}%
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                {/* Additional Information */}
                {result.is_job_related && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Extracted Information
                      </Typography>
                      <Stack spacing={1}>
                        {result.job_type && (
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2">Job Type:</Typography>
                            <Chip label={result.job_type} size="small" />
                          </Box>
                        )}
                        {result.company && (
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2">Company:</Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {result.company}
                            </Typography>
                          </Box>
                        )}
                        {result.position && (
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2">Position:</Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {result.position}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  </>
                )}

                <Divider />

                {/* Metadata */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Metadata
                  </Typography>
                  <Stack spacing={0.5}>
                    {result.model_version && (
                      <Typography variant="caption" color="textSecondary">
                        Model Version: {result.model_version}
                      </Typography>
                    )}
                    {result.processed_at && (
                      <Typography variant="caption" color="textSecondary">
                        Processed: {new Date(result.processed_at).toLocaleString()}
                      </Typography>
                    )}
                    {result.fallback_reason && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        <Typography variant="caption">
                          Fallback Classification: {result.fallback_reason}
                        </Typography>
                      </Alert>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
};

export default MLTestPage;