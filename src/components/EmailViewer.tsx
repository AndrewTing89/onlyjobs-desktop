import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Paper,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Email as EmailIcon,
  Close as CloseIcon,
  History as HistoryIcon,
} from '@mui/icons-material';

interface EmailViewerProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`email-tabpanel-${index}`}
      aria-labelledby={`email-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export const EmailViewer: React.FC<EmailViewerProps> = ({ open, onClose, jobId, jobTitle }) => {
  const [loading, setLoading] = useState(false);
  const [emailContent, setEmailContent] = useState<string>('');
  const [emailHistory, setEmailHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (open && jobId) {
      fetchEmailContent();
    }
  }, [open, jobId]);

  const fetchEmailContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.getJobEmail(jobId);
      if (result.success) {
        setEmailContent(result.emailContent || 'No email content available');
        setEmailHistory(result.emailHistory || []);
      } else {
        setError(result.error || 'Failed to fetch email content');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const formatEmailContent = (content: string) => {
    // Split content into lines and format for better readability
    const lines = content.split('\n');
    const formatted: React.ReactElement[] = [];
    let currentSection = '';
    
    lines.forEach((line, index) => {
      if (line.startsWith('Subject:')) {
        formatted.push(
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">Subject</Typography>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              {line.substring(8).trim()}
            </Typography>
          </Box>
        );
      } else if (line.startsWith('From:')) {
        formatted.push(
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">From</Typography>
            <Typography variant="body2">{line.substring(5).trim()}</Typography>
          </Box>
        );
      } else if (line.startsWith('Date:')) {
        formatted.push(
          <Box key={index} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">Date</Typography>
            <Typography variant="body2">{line.substring(5).trim()}</Typography>
          </Box>
        );
      } else if (line.trim() === '' && currentSection !== 'body') {
        currentSection = 'body';
        formatted.push(<Divider key={`divider-${index}`} sx={{ my: 2 }} />);
      } else if (currentSection === 'body' && line.trim()) {
        formatted.push(
          <Typography key={index} variant="body2" paragraph>
            {line}
          </Typography>
        );
      }
    });
    
    return formatted;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon />
            <Typography variant="h6">Email Content</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {jobTitle}
          </Typography>
        </Box>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="email viewer tabs">
          <Tab label="Current Email" />
          <Tab 
            label={`Email History (${emailHistory.length})`} 
            icon={<HistoryIcon />} 
            iconPosition="start"
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ flexGrow: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" sx={{ p: 2 }}>
            {error}
          </Typography>
        ) : (
          <>
            <TabPanel value={tabValue} index={0}>
              <Paper sx={{ p: 3, backgroundColor: 'background.default' }}>
                {emailContent ? (
                  formatEmailContent(emailContent)
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body1" color="text.secondary" gutterBottom>
                      No email content available
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      This job was synced before email content storage was implemented.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      To view email content, please sync new emails or clear all records and re-sync.
                    </Typography>
                  </Box>
                )}
              </Paper>
            </TabPanel>
            
            <TabPanel value={tabValue} index={1}>
              {emailHistory.length > 0 ? (
                <List>
                  {emailHistory.map((email, index) => (
                    <React.Fragment key={email.gmail_message_id || index}>
                      <ListItem>
                        <ListItemText
                          primary={email.subject}
                          secondary={
                            <>
                              <Typography component="span" variant="body2" color="text.primary">
                                {new Date(email.date).toLocaleDateString()}
                              </Typography>
                              {' — '}
                              Message ID: {email.gmail_message_id}
                            </>
                          }
                        />
                      </ListItem>
                      {index < emailHistory.length - 1 && <Divider component="li" />}
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">No email history available</Typography>
              )}
            </TabPanel>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};