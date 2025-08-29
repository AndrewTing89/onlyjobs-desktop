import React, { useState, useEffect } from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControlLabel,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from "@mui/material";
import Grid from '@mui/material/Grid';
import { 
  Assessment,
  Download,
  TrendingUp,
  Warning,
  CheckCircle,
  Error,
  ModelTraining,
  BugReport,
  Domain
} from "@mui/icons-material";
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import auth context

interface TrainingStats {
  totalExamples: number;
  valuableExamples: number;
  exportedExamples: number;
  correctionTypes: { [key: string]: number };
  accuracy: number;
  averageConfidence: number;
  correctionsMade: number;
  recentActivity: Array<{ date: string; count: number }>;
}

interface ExportStats {
  totalExamples: number;
  exportedExamples: number;
  readyToExport: number;
  oldestExample: string;
  newestExample: string;
}

interface Pattern {
  domainPatterns: Array<{
    domain: string;
    totalEmails: number;
    misclassified: number;
    errorRate: number;
    averageConfidence: number;
  }>;
  recentMisclassifications: Array<{
    subject: string;
    bodySnippet: string;
    predicted: boolean;
    actual: boolean;
    confidence: number;
  }>;
}

interface ExportResult {
  success: boolean;
  filename?: string;
  filePath?: string;
  recordCount?: number;
  format?: string;
  message?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function TrainingDataDashboard() {
  const isElectron = !!window.electronAPI;
  
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [patterns, setPatterns] = useState<Pattern | null>(null);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  
  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    format: 'json' as 'csv' | 'json' | 'ml',
    anonymize: true,
    includeExported: false,
    includeFeatures: true
  });

  const loadTrainingData = React.useCallback(async () => {
    if (!isElectron) {
      setError("Training data dashboard is only available in desktop mode");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Load all training data statistics
      const [statsResult, patternsResult] = await Promise.all([
        (window as any).electronAPI.invoke('training:get-stats'),
        (window as any).electronAPI.invoke('training:get-patterns')
      ]);

      setStats(statsResult);
      setPatterns(patternsResult);

      // Get export statistics
      const exportStatsResult = await (window as any).electronAPI.invoke('training:get-export-stats');
      setExportStats(exportStatsResult);

    } catch (err) {
      console.error('Error loading training data:', err);
      setError('Failed to load training data statistics');
    } finally {
      setLoading(false);
    }
  }, [isElectron]);

  // Load training data when component mounts
  useEffect(() => {
    loadTrainingData();
  }, [loadTrainingData]);

  const handleExport = async () => {
    if (!isElectron) return;

    try {
      setExporting(true);
      setError("");

      let result: ExportResult;
      
      const { format, ...otherOptions } = exportOptions;
      result = await (window as any).electronAPI.invoke('training:export', {
        format: format,
        ...otherOptions
      });
      
      if (!result) {
        throw new (Error as any)('Invalid export format');
      }

      if (result.success) {
        setMessage(`Successfully exported ${result.recordCount} training examples to ${result.filename}`);
        setExportDialogOpen(false);
        // Reload stats to reflect export
        loadTrainingData();
      } else {
        setError(result.message || 'Export failed');
      }

    } catch (err) {
      console.error('Error exporting training data:', err);
      setError('Failed to export training data');
    } finally {
      setExporting(false);
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.9) return 'success';
    if (accuracy >= 0.8) return 'warning';
    return 'error';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const prepareActivityChartData = () => {
    if (!stats?.recentActivity) return [];
    
    return stats.recentActivity.map(item => ({
      date: formatDate(item.date),
      corrections: item.count
    }));
  };

  const prepareCorrectionTypeData = () => {
    if (!stats?.correctionTypes) return [];
    
    return Object.entries(stats.correctionTypes).map(([type, count]) => ({
      name: type.replace('_', ' ').toUpperCase(),
      value: count
    }));
  };

  const shouldShowRetrainingSuggestion = () => {
    if (!stats) return false;
    return stats.accuracy < 0.85 && stats.correctionsMade > 10;
  };

  if (!isElectron) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <CssBaseline />
          <Alert severity="error" sx={{ m: 2 }}>
            Training data dashboard is only available in the desktop application.
          </Alert>
        </Box>
      </ThemeProvider>
    );
  }

  if (loading) {
    return (
      <ThemeProvider theme={onlyJobsTheme}>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <CssBaseline />
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={60} />
            <Typography variant="h6" sx={{ mt: 2 }}>
              Loading training data statistics...
            </Typography>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <CssBaseline />
        
        <Sidebar />
        
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <TopBar title="Training Data Dashboard" onLogout={async () => {}} />
          
          <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto' }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            {message && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {message}
              </Alert>
            )}

            {/* Overview Cards */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Assessment color="primary" sx={{ mr: 1 }} />
                      <Typography variant="h6">Total Examples</Typography>
                    </Box>
                    <Typography variant="h4" color="primary">
                      {stats?.totalExamples || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stats?.valuableExamples || 0} valuable for training
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <TrendingUp color="success" sx={{ mr: 1 }} />
                      <Typography variant="h6">Model Accuracy</Typography>
                    </Box>
                    <Typography variant="h4" color={getAccuracyColor(stats?.accuracy || 0)}>
                      {((stats?.accuracy || 0) * 100).toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Average confidence: {((stats?.averageConfidence || 0) * 100).toFixed(1)}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Warning color="warning" sx={{ mr: 1 }} />
                      <Typography variant="h6">Corrections Made</Typography>
                    </Box>
                    <Typography variant="h4" color="warning.main">
                      {stats?.correctionsMade || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      User corrections to model predictions
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Download color="info" sx={{ mr: 1 }} />
                      <Typography variant="h6">Ready to Export</Typography>
                    </Box>
                    <Typography variant="h4" color="info.main">
                      {exportStats?.readyToExport || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {exportStats?.exportedExamples || 0} already exported
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Retraining Suggestion */}
            {shouldShowRetrainingSuggestion() && (
              <Alert 
                severity="info" 
                sx={{ mb: 3 }}
                action={
                  <Button color="inherit" size="small">
                    Export Training Data
                  </Button>
                }
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ModelTraining sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    Model accuracy is below 85% with {stats?.correctionsMade} corrections available. 
                    Consider retraining the model with new training data.
                  </Typography>
                </Box>
              </Alert>
            )}

            {/* Charts Section */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {/* Recent Activity Chart */}
              <Grid size={{ xs: 12, md: 8 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Recent Correction Activity (Last 30 Days)
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={prepareActivityChartData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="corrections" 
                          stroke="#8884d8" 
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Correction Types Pie Chart */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Correction Types
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={prepareCorrectionTypeData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => entry.name}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {prepareCorrectionTypeData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Analysis Section */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {/* Domain Patterns */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <Domain sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Problem Domains
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Email domains with highest misclassification rates
                    </Typography>
                    
                    {patterns?.domainPatterns && patterns.domainPatterns.length > 0 ? (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Domain</TableCell>
                              <TableCell align="right">Total</TableCell>
                              <TableCell align="right">Errors</TableCell>
                              <TableCell align="right">Error Rate</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {patterns.domainPatterns.slice(0, 5).map((domain, index) => (
                              <TableRow key={index}>
                                <TableCell>{domain.domain}</TableCell>
                                <TableCell align="right">{domain.totalEmails}</TableCell>
                                <TableCell align="right">{domain.misclassified}</TableCell>
                                <TableCell align="right">
                                  <Chip 
                                    label={`${(domain.errorRate * 100).toFixed(1)}%`}
                                    color={domain.errorRate > 0.3 ? 'error' : domain.errorRate > 0.1 ? 'warning' : 'success'}
                                    size="small"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No domain patterns available yet. More data needed for analysis.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Recent Misclassifications */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      <BugReport sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Recent Misclassifications
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Examples where the model was corrected by users
                    </Typography>
                    
                    {patterns?.recentMisclassifications && patterns.recentMisclassifications.length > 0 ? (
                      <List>
                        {patterns.recentMisclassifications.slice(0, 5).map((item, index) => (
                          <ListItem key={index} divider>
                            <ListItemIcon>
                              {item.predicted !== item.actual ? <Error color="error" /> : <CheckCircle color="success" />}
                            </ListItemIcon>
                            <ListItemText
                              primary={item.subject}
                              secondary={
                                <Box>
                                  <Typography variant="body2" color="text.secondary">
                                    {item.bodySnippet}
                                  </Typography>
                                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                                    Predicted: {item.predicted ? 'Job' : 'Not Job'} → 
                                    Actual: {item.actual ? 'Job' : 'Not Job'} 
                                    (Confidence: {(item.confidence * 100).toFixed(1)}%)
                                  </Typography>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No recent misclassifications found.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Export Section */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <Download sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Export Training Data
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Export user corrections and training examples for model improvement
                </Typography>
                
                <Button
                  variant="contained"
                  startIcon={<Download />}
                  onClick={() => setExportDialogOpen(true)}
                  disabled={!exportStats?.readyToExport}
                >
                  Export Training Data ({exportStats?.readyToExport || 0} examples ready)
                </Button>

                {exportStats && exportStats.oldestExample && (
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Data range: {formatDate(exportStats.oldestExample)} to {formatDate(exportStats.newestExample)}
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Export Dialog */}
            <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle>Export Training Data</DialogTitle>
              <DialogContent>
                <DialogContentText sx={{ mb: 2 }}>
                  Configure export options for training data
                </DialogContentText>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Export Format:</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Button 
                      variant={exportOptions.format === 'json' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setExportOptions(prev => ({ ...prev, format: 'json' }))}
                    >
                      JSON
                    </Button>
                    <Button 
                      variant={exportOptions.format === 'csv' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setExportOptions(prev => ({ ...prev, format: 'csv' }))}
                    >
                      CSV
                    </Button>
                    <Button 
                      variant={exportOptions.format === 'ml' ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setExportOptions(prev => ({ ...prev, format: 'ml' }))}
                    >
                      ML Training
                    </Button>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch 
                        checked={exportOptions.anonymize}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, anonymize: e.target.checked }))}
                      />
                    }
                    label="Anonymize sensitive data"
                  />
                  <FormControlLabel
                    control={
                      <Switch 
                        checked={exportOptions.includeExported}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, includeExported: e.target.checked }))}
                      />
                    }
                    label="Include previously exported data"
                  />
                  <FormControlLabel
                    control={
                      <Switch 
                        checked={exportOptions.includeFeatures}
                        onChange={(e) => setExportOptions(prev => ({ ...prev, includeFeatures: e.target.checked }))}
                      />
                    }
                    label="Include extracted features"
                  />
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setExportDialogOpen(false)} disabled={exporting}>
                  Cancel
                </Button>
                <Button onClick={handleExport} variant="contained" disabled={exporting}>
                  {exporting ? <CircularProgress size={20} /> : 'Export'}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}