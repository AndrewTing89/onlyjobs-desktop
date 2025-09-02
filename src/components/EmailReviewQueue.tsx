import React, { useState, useEffect } from 'react';
import { getConfidenceColor, getConfidenceLabel } from '../utils/confidence';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  LinearProgress,
  Badge,
  Tooltip,
  Divider,
  CircularProgress,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Email,
  Business,
  Work,
  QuestionMark,
  Search,
  Refresh,
  Close,
  ThumbUp,
  ThumbDown
} from '@mui/icons-material';

interface EmailReview {
  id: string;
  gmail_message_id: string;
  account_email: string;
  subject: string;
  from_email: string;
  body_text: string;
  received_date: string;
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: string | null;
  confidence_score: number;
  classification_model: string;
  retention_days: number;
  expires_at: string;
}

interface ReviewStats {
  total: number;
  pending: number;
  reviewed: number;
  expiringSoon: number;
  byConfidence: Array<{ level: string; count: number }>;
}

interface EmailReviewQueueProps {
  open?: boolean;
  onClose?: () => void;
  embedded?: boolean; // For embedding in dashboard
}

export function EmailReviewQueue({ open = false, onClose, embedded = false }: EmailReviewQueueProps) {
  const [reviews, setReviews] = useState<EmailReview[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReviews();
    loadStats();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.review.getPending({
        confidence_max: 0.7,
        reviewed: false,
        limit: embedded ? 5 : 50
      });
      
      if (result.success) {
        setReviews(result.reviews || []);
      } else {
        setError(result.error || 'Failed to load reviews');
      }
    } catch (err: any) {
      console.error('Error loading reviews:', err);
      setError('Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await window.electronAPI.review.getStats();
      if (result.success && result.stats) {
        setStats(result.stats);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleMarkAsJob = async (review: EmailReview) => {
    try {
      setProcessing(review.id);
      
      const result = await window.electronAPI.review.markJobRelated(review.id);
      
      if (result.success) {
        // Remove from list
        setReviews(prev => prev.filter(r => r.id !== review.id));
        // Update stats
        if (stats) {
          setStats({
            ...stats,
            pending: stats.pending - 1,
            reviewed: stats.reviewed + 1
          });
        }
        
        // Train ML with this correction
        await window.electronAPI.ml.submitFeedback({
          emailId: review.gmail_message_id,
          isJobRelated: true,
          company: review.company || undefined,
          position: review.position || undefined,
          confidence: 1.0 // High confidence since manually confirmed
        });
      } else {
        setError(result.error || 'Failed to mark as job-related');
      }
    } catch (err: any) {
      console.error('Error marking as job:', err);
      setError('Failed to update classification');
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirmNotJob = async (review: EmailReview) => {
    try {
      setProcessing(review.id);
      
      const result = await window.electronAPI.review.confirmNotJob(review.id);
      
      if (result.success) {
        // Remove from list
        setReviews(prev => prev.filter(r => r.id !== review.id));
        // Update stats
        if (stats) {
          setStats({
            ...stats,
            pending: stats.pending - 1,
            reviewed: stats.reviewed + 1
          });
        }
        
        // Train ML with this confirmation
        await window.electronAPI.ml.submitFeedback({
          emailId: review.gmail_message_id,
          isJobRelated: false,
          confidence: 1.0
        });
      } else {
        setError(result.error || 'Failed to confirm classification');
      }
    } catch (err: any) {
      console.error('Error confirming not job:', err);
      setError('Failed to update classification');
    } finally {
      setProcessing(null);
    }
  };

  // Using standardized confidence utilities from utils/confidence.ts

  const filteredReviews = reviews.filter(review =>
    searchTerm === '' ||
    review.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    review.from_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (review.company && review.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const content = (
    <Box>
      {/* Header */}
      {!embedded && (
        <Box mb={2}>
          <Typography variant="h6" gutterBottom>
            Review Uncertain Classifications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Help improve the ML model by confirming or correcting these classifications
          </Typography>
        </Box>
      )}

      {/* Stats */}
      {stats && stats.pending > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            {stats.pending} emails need review • {stats.expiringSoon} expiring soon
          </Typography>
        </Alert>
      )}

      {/* Search */}
      {!embedded && reviews.length > 5 && (
        <TextField
          fullWidth
          size="small"
          placeholder="Search emails..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            )
          }}
        />
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : filteredReviews.length === 0 ? (
        <Alert severity="success">
          No emails need review - all classifications look good!
        </Alert>
      ) : (
        <List>
          {filteredReviews.map((review, index) => (
            <React.Fragment key={review.id}>
              <ListItem alignItems="flex-start">
                <Box flex={1}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Email fontSize="small" color="action" />
                    <Typography variant="subtitle2" noWrap sx={{ maxWidth: 400 }}>
                      {review.subject}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${getConfidenceLabel(review.confidence_score)} (${(review.confidence_score * 100).toFixed(0)}%)`}
                      color={getConfidenceColor(review.confidence_score) as any}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    From: {review.from_email}
                  </Typography>
                  
                  <Typography variant="body2" noWrap sx={{ maxWidth: 600 }}>
                    {review.body_text.substring(0, 150)}...
                  </Typography>
                  
                  {/* ML Prediction */}
                  <Box display="flex" alignItems="center" gap={1} mt={1}>
                    <Typography variant="caption" color="text.secondary">
                      ML thinks:
                    </Typography>
                    <Chip
                      size="small"
                      label={review.is_job_related ? 'Job Related' : 'Not Job Related'}
                      color={review.is_job_related ? 'primary' : 'default'}
                      variant={review.is_job_related ? 'filled' : 'outlined'}
                    />
                    {review.company && (
                      <Chip
                        size="small"
                        label={review.company}
                        icon={<Business fontSize="small" />}
                        variant="outlined"
                      />
                    )}
                    {review.position && (
                      <Chip
                        size="small"
                        label={review.position}
                        icon={<Work fontSize="small" />}
                        variant="outlined"
                      />
                    )}
                  </Box>
                  
                  {/* Actions */}
                  <Box display="flex" gap={1} mt={2}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={processing === review.id ? <CircularProgress size={16} /> : <ThumbUp />}
                      onClick={() => handleMarkAsJob(review)}
                      disabled={processing === review.id}
                    >
                      Yes, Job Related
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={processing === review.id ? <CircularProgress size={16} /> : <ThumbDown />}
                      onClick={() => handleConfirmNotJob(review)}
                      disabled={processing === review.id}
                    >
                      Not Job Related
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setSelectedEmail(review)}
                    >
                      View Full
                    </Button>
                  </Box>
                </Box>
              </ListItem>
              {index < filteredReviews.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      )}

      {/* Refresh Button */}
      {!embedded && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Button startIcon={<Refresh />} onClick={loadReviews}>
            Refresh Queue
          </Button>
        </Box>
      )}
    </Box>
  );

  if (embedded) {
    return content;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '80vh' } }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <QuestionMark />
            Email Review Queue
            {stats && stats.pending > 0 && (
              <Badge badgeContent={stats.pending} color="primary" />
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {content}
      </DialogContent>
    </Dialog>
  );
}