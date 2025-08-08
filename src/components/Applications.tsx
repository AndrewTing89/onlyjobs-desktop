import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Drawer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Divider,
  Button
} from '@mui/material';
import {
  Business,
  CalendarToday,
  Search,
  Refresh,
  Timeline as TimelineIcon,
  Email,
  Close
} from '@mui/icons-material';
import { onlyJobsClient, type Application, type ApplicationTimeline } from '../lib/onlyjobsClient';

const accent = "#FF7043";

const statusColors: Record<string, string> = {
  Applied: '#2196F3',
  Interview: '#FF9800', 
  Declined: '#F44336',
  Offer: '#4CAF50'
};

export default function Applications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [timelineDrawerOpen, setTimelineDrawerOpen] = useState(false);
  const [selectedTimeline, setSelectedTimeline] = useState<ApplicationTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const result = await onlyJobsClient.fetchApplications({
        limit: 100
      });
      console.log('Loaded applications:', result);
      setApplications(result.rows);
    } catch (error: any) {
      console.error('Error loading applications:', error);
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTimeline = async (application: Application) => {
    try {
      setTimelineLoading(true);
      const timeline = await onlyJobsClient.fetchApplicationTimeline(application.application_id);
      setSelectedTimeline(timeline);
      setTimelineDrawerOpen(true);
    } catch (error: any) {
      console.error('Error loading timeline:', error);
      setError('Failed to load application timeline');
    } finally {
      setTimelineLoading(false);
    }
  };

  const filteredApplications = applications.filter(app => {
    const companyMatch = app.company?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const positionMatch = app.position?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    return companyMatch || positionMatch;
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Applications</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <IconButton size="small" onClick={loadApplications} title="Refresh">
                <Refresh />
              </IconButton>
            </Box>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {filteredApplications.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center">
              No applications found. Process some job emails to see applications here!
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Company</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Events</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredApplications.map((app) => (
                    <TableRow key={app.application_id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Business sx={{ fontSize: 18, color: accent }} />
                          <Typography variant="body2" fontWeight={500}>
                            {app.company}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {app.position || 'Unknown Position'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {app.current_status && (
                          <Chip
                            label={app.current_status}
                            size="small"
                            sx={{
                              backgroundColor: statusColors[app.current_status] + '20',
                              color: statusColors[app.current_status],
                              border: `1px solid ${statusColors[app.current_status]}40`,
                              fontWeight: 500
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" color="primary.main" fontWeight={500}>
                          {app.events_count}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarToday sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="body2" color="text.secondary">
                            {new Date(app.last_updated_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleViewTimeline(app)}
                          title="View Timeline"
                        >
                          <TimelineIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Timeline Drawer */}
      <Drawer
        anchor="right"
        open={timelineDrawerOpen}
        onClose={() => setTimelineDrawerOpen(false)}
        PaperProps={{ sx: { width: 600 } }}
      >
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h6">Application Timeline</Typography>
            <IconButton onClick={() => setTimelineDrawerOpen(false)}>
              <Close />
            </IconButton>
          </Box>

          {timelineLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          )}

          {selectedTimeline && !timelineLoading && (
            <Box>
              {/* Application Summary */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {selectedTimeline.application.company}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {selectedTimeline.application.position || 'Unknown Position'}
                  </Typography>
                  {selectedTimeline.application.current_status && (
                    <Chip
                      label={selectedTimeline.application.current_status}
                      size="small"
                      sx={{
                        backgroundColor: statusColors[selectedTimeline.application.current_status] + '20',
                        color: statusColors[selectedTimeline.application.current_status],
                        border: `1px solid ${statusColors[selectedTimeline.application.current_status]}40`,
                        fontWeight: 500,
                        mt: 1
                      }}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Timeline Events */}
              <Typography variant="subtitle1" gutterBottom>
                Timeline ({selectedTimeline.events.length} events)
              </Typography>
              
              <List>
                {selectedTimeline.events.map((event, index) => (
                  <React.Fragment key={event.event_id}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Email sx={{ fontSize: 16, color: 'primary.main' }} />
                            <Typography variant="body2" fontWeight={500}>
                              {event.subject}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                              {event.status && (
                                <Chip
                                  label={event.status}
                                  size="small"
                                  sx={{
                                    backgroundColor: statusColors[event.status] + '20',
                                    color: statusColors[event.status],
                                    border: `1px solid ${statusColors[event.status]}40`,
                                    fontWeight: 500
                                  }}
                                />
                              )}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CalendarToday sx={{ fontSize: 14, color: 'text.secondary' }} />
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(event.event_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Typography>
                              </Box>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                              From: {event.from_email}
                            </Typography>
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            // Here we could open the email detail modal
                            console.log('View email:', event.gmail_message_id);
                          }}
                        >
                          View Email
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < selectedTimeline.events.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}