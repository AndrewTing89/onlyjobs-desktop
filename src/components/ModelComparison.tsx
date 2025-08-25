import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Alert,
  Chip,
  Card,
  CardContent,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
  Badge,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Download as DownloadIcon,
  PlayArrow as PlayIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Speed as SpeedIcon,
  Science as ScienceIcon,
  CompareArrows as CompareIcon,
  Refresh as RefreshIcon,
  Email as EmailIcon,
  Search as SearchIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';

interface ModelInfo {
  id: string;
  name: string;
  filename: string;
  size: number;
  description: string;
}

interface ModelStatus {
  status: 'ready' | 'downloading' | 'not_installed' | 'corrupt';
  progress?: number;
  downloadedSize?: number;
  totalSize?: number;
  size?: number;
  path?: string;
  error?: string;
  expectedSize?: number;
}

interface EmailData {
  id: string;
  subject: string;
  from: string;
  body: string;
  date: string;
  threadId?: string;
  source?: 'gmail' | 'review';
  reviewId?: string;
  confidence?: number;
  classification?: {
    is_job_related: boolean;
    company: string | null;
    position: string | null;
    status: string | null;
  };
}

interface ClassificationResult {
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: string | null;
  confidence?: number;
  error?: string;
}

interface TestResult {
  emailId: string;
  subject: string;
  result: ClassificationResult;
  processingTime: number;
  timestamp: string;
  groundTruth?: {
    is_job_related?: boolean;
    company?: string;
    position?: string;
    status?: string;
  };
}

interface ModelTestResults {
  [modelId: string]: TestResult[];
}

export const ModelComparison: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({});
  const [activeTab, setActiveTab] = useState(0);
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [testResults, setTestResults] = useState<ModelTestResults>({});
  const [testingEmail, setTestingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [emailFilter, setEmailFilter] = useState<'all' | 'tested' | 'untested'>('all');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  useEffect(() => {
    loadModels();
    loadEmails();
  }, []);

  const loadModels = async () => {
    try {
      const result = await window.electronAPI.models.getAllModels();
      setModels(result.models);
      setModelStatuses(result.statuses);
      
      // Initialize test results for each model
      const initialResults: ModelTestResults = {};
      result.models.forEach((model: ModelInfo) => {
        initialResults[model.id] = [];
      });
      setTestResults(initialResults);
    } catch (err) {
      console.error('Failed to load models:', err);
      setError('Failed to load model information');
    }
  };

  const loadEmails = async () => {
    setLoadingEmails(true);
    try {
      const result = await window.electronAPI.models.getRecentEmails();
      if (result.success && result.emails) {
        setEmails(result.emails);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Failed to load emails:', err);
      setError('Failed to load emails from Gmail');
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    try {
      setError(null);
      await window.electronAPI.models.downloadModel(modelId);
      
      setModelStatuses(prev => ({
        ...prev,
        [modelId]: { status: 'downloading', progress: 0 }
      }));
    } catch (err: any) {
      setError(`Failed to download model: ${err.message}`);
    }
  };

  const testEmailWithAllModels = async (email: EmailData) => {
    setTestingEmail(email.id);
    setError(null);
    
    try {
      // Get all ready models
      const readyModels = Object.entries(modelStatuses)
        .filter(([_, status]) => status.status === 'ready')
        .map(([modelId, _]) => modelId);
      
      if (readyModels.length === 0) {
        setError('No models are ready. Please download at least one model first.');
        return;
      }
      
      // Run comparison
      const results = await window.electronAPI.models.runComparison({
        subject: email.subject,
        body: email.body,
        customPrompt: useCustomPrompt ? customPrompt : undefined
      });
      
      if (results.success === false) {
        setError(results.error || 'Failed to run comparison');
        return;
      }
      
      // Store results for each model
      const newTestResults = { ...testResults };
      results.results.forEach((result: any) => {
        const testResult: TestResult = {
          emailId: email.id,
          subject: email.subject,
          result: result.result,
          processingTime: result.processingTime,
          timestamp: new Date().toISOString()
        };
        
        if (!newTestResults[result.modelId]) {
          newTestResults[result.modelId] = [];
        }
        newTestResults[result.modelId].unshift(testResult);
      });
      
      setTestResults(newTestResults);
      
      // Switch to first model tab to show results
      if (readyModels.length > 0) {
        const firstModelIndex = models.findIndex(m => m.id === readyModels[0]);
        if (firstModelIndex >= 0) {
          setActiveTab(firstModelIndex + 1);
        }
      }
    } catch (err: any) {
      setError(`Failed to test email: ${err.message}`);
    } finally {
      setTestingEmail(null);
    }
  };

  const markGroundTruth = (modelId: string, emailId: string, isCorrect: boolean) => {
    setTestResults(prev => {
      const newResults = { ...prev };
      const modelResults = newResults[modelId] || [];
      const resultIndex = modelResults.findIndex(r => r.emailId === emailId);
      
      if (resultIndex >= 0) {
        modelResults[resultIndex].groundTruth = {
          is_job_related: isCorrect ? modelResults[resultIndex].result.is_job_related : !modelResults[resultIndex].result.is_job_related
        };
        newResults[modelId] = [...modelResults];
      }
      
      return newResults;
    });
  };

  const getEmailTestStatus = (emailId: string) => {
    // Check if email has been tested by any model
    for (const modelId in testResults) {
      if (testResults[modelId].some(r => r.emailId === emailId)) {
        return true;
      }
    }
    return false;
  };

  const getFilteredEmails = () => {
    let filtered = emails;
    
    // Apply test status filter
    if (emailFilter === 'tested') {
      filtered = filtered.filter(email => getEmailTestStatus(email.id));
    } else if (emailFilter === 'untested') {
      filtered = filtered.filter(email => !getEmailTestStatus(email.id));
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(email => 
        email.subject.toLowerCase().includes(query) ||
        email.from.toLowerCase().includes(query) ||
        email.body.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const calculateModelAccuracy = (modelId: string) => {
    const results = testResults[modelId] || [];
    const withGroundTruth = results.filter(r => r.groundTruth?.is_job_related !== undefined);
    
    if (withGroundTruth.length === 0) return null;
    
    const correct = withGroundTruth.filter(r => 
      r.result.is_job_related === r.groundTruth?.is_job_related
    ).length;
    
    return {
      accuracy: (correct / withGroundTruth.length) * 100,
      total: withGroundTruth.length,
      correct
    };
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Listen for download progress updates
  useEffect(() => {
    const handleProgress = (progress: any) => {
      setModelStatuses(prev => ({
        ...prev,
        [progress.modelId]: {
          status: 'downloading',
          progress: progress.progress,
          downloadedSize: progress.downloadedSize,
          totalSize: progress.totalSize
        }
      }));
    };
    
    const handleComplete = (result: any) => {
      loadModels();
    };
    
    window.electronAPI.on('model-download-progress', handleProgress);
    window.electronAPI.on('model-download-complete', handleComplete);
    
    return () => {
      window.electronAPI.removeAllListeners('model-download-progress');
      window.electronAPI.removeAllListeners('model-download-complete');
    };
  }, []);

  // Tab labels
  const getTabLabel = (index: number) => {
    if (index === 0) return 'Gmail Inbox';
    if (index <= models.length) {
      const model = models[index - 1];
      const results = testResults[model.id] || [];
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {model.name}
          {results.length > 0 && (
            <Badge badgeContent={results.length} color="primary" />
          )}
        </Box>
      );
    }
    return 'Comparison';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ScienceIcon />
        Model Testing & Comparison
      </Typography>
      
      <Typography variant="body2" color="text.secondary" paragraph>
        Test and compare different LLM models on real Gmail emails to find the best one for job classification.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Custom Prompt Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: useCustomPrompt ? 2 : 0 }}>
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Prompt Configuration
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              size="small"
              variant={useCustomPrompt ? "contained" : "outlined"}
              onClick={() => setUseCustomPrompt(!useCustomPrompt)}
              color={useCustomPrompt ? "primary" : "inherit"}
            >
              {useCustomPrompt ? "Custom Prompt" : "Default Prompt"}
            </Button>
            {useCustomPrompt && (
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setCustomPrompt('');
                  setUseCustomPrompt(false);
                }}
              >
                Reset
              </Button>
            )}
          </Box>
        </Box>
        
        {useCustomPrompt && (
          <>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter your custom prompt here. Make sure it instructs the model to return JSON with: is_job_related (boolean), company (string), position (string), status (string)"
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }
              }}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Required JSON fields: is_job_related, company, position, status
            </Typography>
          </>
        )}
      </Paper>

      {/* Model Status Bar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {models.map((model) => {
          const status = modelStatuses[model.id] || { status: 'not_installed' };
          const accuracy = calculateModelAccuracy(model.id);
          
          return (
            <Chip
              key={model.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {status.status === 'ready' ? (
                    <CheckIcon fontSize="small" />
                  ) : status.status === 'downloading' ? (
                    <CircularProgress size={16} variant="determinate" value={status.progress || 0} />
                  ) : (
                    <CancelIcon fontSize="small" />
                  )}
                  <span>{model.name}</span>
                  {accuracy && (
                    <span style={{ marginLeft: 4, fontSize: '0.85em', opacity: 0.8 }}>
                      {accuracy.accuracy.toFixed(0)}%
                    </span>
                  )}
                </Box>
              }
              color={status.status === 'ready' ? 'success' : status.status === 'downloading' ? 'warning' : 'default'}
              variant={status.status === 'ready' ? 'filled' : 'outlined'}
              onClick={() => {
                if (status.status === 'not_installed') {
                  handleDownloadModel(model.id);
                }
              }}
              clickable={status.status === 'not_installed'}
            />
          );
        })}
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Gmail Emails
                <Badge badgeContent={emails.length} color="primary" />
              </Box>
            } 
            icon={<EmailIcon />} 
            iconPosition="start" 
          />
          {models.map((model, index) => (
            <Tab key={model.id} label={getTabLabel(index + 1)} />
          ))}
          <Tab label="Comparison" icon={<CompareIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box>
        {/* Gmail Inbox Tab */}
        {activeTab === 0 && (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Your Gmail Emails (Last 60 Days)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={loadEmails}
                  disabled={loadingEmails}
                >
                  Refresh
                </Button>
              </Box>
            </Box>

            {/* Search and Filter */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                size="small"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ flexGrow: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  label="All"
                  onClick={() => setEmailFilter('all')}
                  color={emailFilter === 'all' ? 'primary' : 'default'}
                />
                <Chip
                  label="Tested"
                  onClick={() => setEmailFilter('tested')}
                  color={emailFilter === 'tested' ? 'primary' : 'default'}
                />
                <Chip
                  label="Untested"
                  onClick={() => setEmailFilter('untested')}
                  color={emailFilter === 'untested' ? 'primary' : 'default'}
                />
              </Box>
            </Box>
            
            {/* Show stats if we have review emails */}
            {emails.some(e => e.source === 'review') && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Showing {emails.filter(e => e.source === 'gmail').length} Gmail emails and{' '}
                {emails.filter(e => e.source === 'review').length} uncertain emails from review queue
              </Alert>
            )}

            {loadingEmails ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : emails.length === 0 ? (
              <Alert severity="info">
                No emails found. Make sure you have a Gmail account connected.
              </Alert>
            ) : (
              <List sx={{ maxHeight: 600, overflow: 'auto' }}>
                {getFilteredEmails().map((email) => {
                  const isTested = getEmailTestStatus(email.id);
                  const isTestingThis = testingEmail === email.id;
                  
                  return (
                    <React.Fragment key={email.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {email.subject}
                              {isTested && (
                                <Chip label="Tested" size="small" color="success" />
                              )}
                              {email.source === 'review' && (
                                <Chip 
                                  label={`Review Queue - ${Math.round((email.confidence || 0) * 100)}% confidence`} 
                                  size="small" 
                                  color="warning"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            <>
                              <Typography variant="caption" component="span" sx={{ display: 'block' }}>
                                From: {email.from}
                              </Typography>
                              <Typography variant="caption" component="span" sx={{ display: 'block' }}>
                                Date: {new Date(email.date).toLocaleDateString()}
                              </Typography>
                              {email.classification && (
                                <Typography variant="caption" component="span" sx={{ display: 'block', mt: 0.5 }}>
                                  Previous: {email.classification.is_job_related ? '✅ Job' : '❌ Not Job'} 
                                  {email.classification.company && ` - ${email.classification.company}`}
                                  {email.classification.position && ` - ${email.classification.position}`}
                                </Typography>
                              )}
                              <Typography 
                                variant="body2" 
                                component="span" 
                                sx={{ 
                                  display: 'block',
                                  mt: 0.5,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: 'text.secondary'
                                }}
                              >
                                {email.body.substring(0, 150)}...
                              </Typography>
                            </>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => testEmailWithAllModels(email)}
                            disabled={isTestingThis || Object.values(modelStatuses).every(s => s.status !== 'ready')}
                            startIcon={isTestingThis ? <CircularProgress size={16} /> : <PlayIcon />}
                          >
                            {isTestingThis ? 'Testing...' : 'Test'}
                          </Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </Paper>
        )}

        {/* Individual Model Tabs */}
        {activeTab > 0 && activeTab <= models.length && (
          <Paper sx={{ p: 3 }}>
            {(() => {
              const model = models[activeTab - 1];
              const status = modelStatuses[model.id] || { status: 'not_installed' };
              const results = testResults[model.id] || [];
              const accuracy = calculateModelAccuracy(model.id);
              
              return (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {model.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {model.description}
                      </Typography>
                      {accuracy && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          Accuracy: {accuracy.accuracy.toFixed(1)}% ({accuracy.correct}/{accuracy.total} correct)
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      {status.status === 'ready' ? (
                        <Chip label="Ready" color="success" icon={<CheckIcon />} />
                      ) : status.status === 'downloading' ? (
                        <Box>
                          <CircularProgress variant="determinate" value={status.progress || 0} />
                          <Typography variant="caption" display="block" textAlign="center">
                            {Math.round(status.progress || 0)}%
                          </Typography>
                        </Box>
                      ) : (
                        <Button
                          variant="contained"
                          startIcon={<DownloadIcon />}
                          onClick={() => handleDownloadModel(model.id)}
                        >
                          Download ({formatBytes(model.size)})
                        </Button>
                      )}
                    </Box>
                  </Box>

                  {results.length === 0 ? (
                    <Alert severity="info">
                      No emails tested with this model yet. Go to the Gmail Inbox tab to test emails.
                    </Alert>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Email Subject</TableCell>
                            <TableCell align="center">Job Related</TableCell>
                            <TableCell>Company</TableCell>
                            <TableCell>Position</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="center">Time</TableCell>
                            <TableCell align="center">Ground Truth</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {results.map((result, index) => (
                            <TableRow key={`${result.emailId}-${index}`}>
                              <TableCell>
                                <Tooltip title={result.subject}>
                                  <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                                    {result.subject}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell align="center">
                                {result.result.error ? (
                                  <Chip label="Error" color="error" size="small" />
                                ) : result.result.is_job_related ? (
                                  <CheckIcon color="success" />
                                ) : (
                                  <CancelIcon color="error" />
                                )}
                              </TableCell>
                              <TableCell>{result.result.company || '-'}</TableCell>
                              <TableCell>{result.result.position || '-'}</TableCell>
                              <TableCell>
                                {result.result.status && (
                                  <Chip
                                    label={result.result.status}
                                    size="small"
                                    color={
                                      result.result.status.toLowerCase().includes('offer') ? 'success' :
                                      result.result.status.toLowerCase().includes('interview') ? 'warning' :
                                      result.result.status.toLowerCase().includes('declined') ? 'error' :
                                      'default'
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell align="center">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                  <SpeedIcon fontSize="small" color="action" />
                                  {formatTime(result.processingTime)}
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                  <IconButton
                                    size="small"
                                    color={result.groundTruth?.is_job_related === result.result.is_job_related ? 'success' : 'default'}
                                    onClick={() => markGroundTruth(model.id, result.emailId, true)}
                                  >
                                    <ThumbUpIcon fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    color={result.groundTruth?.is_job_related !== undefined && result.groundTruth.is_job_related !== result.result.is_job_related ? 'error' : 'default'}
                                    onClick={() => markGroundTruth(model.id, result.emailId, false)}
                                  >
                                    <ThumbDownIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              );
            })()}
          </Paper>
        )}

        {/* Comparison Tab */}
        {activeTab === models.length + 1 && (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">
                Model Comparison
              </Typography>
              <Button
                variant="outlined"
                startIcon={<ExportIcon />}
                onClick={() => {
                  // TODO: Implement export functionality
                  console.log('Export results');
                }}
              >
                Export Results
              </Button>
            </Box>

            {/* Get all unique tested emails */}
            {(() => {
              const allTestedEmails = new Map<string, EmailData>();
              
              // Collect all tested emails
              Object.values(testResults).forEach(modelResults => {
                modelResults.forEach(result => {
                  if (!allTestedEmails.has(result.emailId)) {
                    const email = emails.find(e => e.id === result.emailId);
                    if (email) {
                      allTestedEmails.set(result.emailId, email);
                    }
                  }
                });
              });

              if (allTestedEmails.size === 0) {
                return (
                  <Alert severity="info">
                    No emails have been tested yet. Go to the Gmail Inbox tab to test emails with all models.
                  </Alert>
                );
              }

              return (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Email</TableCell>
                        {models.map(model => (
                          <TableCell key={model.id} align="center">
                            {model.name}
                          </TableCell>
                        ))}
                        <TableCell align="center">Agreement</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Array.from(allTestedEmails.values()).map(email => {
                        const modelResults = models.map(model => {
                          const results = testResults[model.id] || [];
                          return results.find(r => r.emailId === email.id);
                        });

                        // Calculate agreement
                        const jobRelatedCount = modelResults.filter(r => r?.result.is_job_related).length;
                        const totalResponses = modelResults.filter(r => r).length;
                        const hasAgreement = totalResponses > 0 && (jobRelatedCount === 0 || jobRelatedCount === totalResponses);

                        return (
                          <TableRow key={email.id}>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {email.subject}
                              </Typography>
                            </TableCell>
                            {models.map((model, index) => {
                              const result = modelResults[index];
                              if (!result) {
                                return <TableCell key={model.id} align="center">-</TableCell>;
                              }

                              return (
                                <TableCell key={model.id} align="center">
                                  <Box>
                                    {result.result.is_job_related ? (
                                      <CheckIcon color="success" fontSize="small" />
                                    ) : (
                                      <CancelIcon color="error" fontSize="small" />
                                    )}
                                    {result.result.is_job_related && (
                                      <Typography variant="caption" display="block">
                                        {result.result.company || 'Unknown'}
                                      </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                      {formatTime(result.processingTime)}
                                    </Typography>
                                  </Box>
                                </TableCell>
                              );
                            })}
                            <TableCell align="center">
                              <Chip
                                label={hasAgreement ? 'Agree' : 'Disagree'}
                                size="small"
                                color={hasAgreement ? 'success' : 'warning'}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            })()}

            {/* Summary Statistics */}
            <Box sx={{ mt: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
              {models.map(model => {
                const accuracy = calculateModelAccuracy(model.id);
                const results = testResults[model.id] || [];
                const avgTime = results.length > 0 
                  ? results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
                  : 0;

                return (
                  <Card key={model.id}>
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        {model.name}
                      </Typography>
                      <Typography variant="h6">
                        {accuracy ? `${accuracy.accuracy.toFixed(1)}%` : 'N/A'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Accuracy ({accuracy ? `${accuracy.correct}/${accuracy.total}` : '0/0'})
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Avg time: {formatTime(avgTime)}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};