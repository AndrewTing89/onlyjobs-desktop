import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  LinearProgress
} from '@mui/material';
import {
  EditNote,
  Save,
  RestartAlt,
  Info,
  CheckCircle,
  ContentCopy,
  Add,
  Delete,
  Help,
  Code,
  Psychology,
  Memory,
  Warning
} from '@mui/icons-material';
import { onlyJobsTheme } from '../theme';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface PromptExample {
  input: string;
  output: string;
  description?: string;
}

const DEFAULT_EXAMPLES: PromptExample[] = [
  {
    input: `From: no-reply@myworkday.com
Subject: Action Required: Application for Software Engineer at Meta
Your application has been successfully submitted for the Software Engineer position at Meta. You can track your application status by logging into Workday.`,
    output: `{"is_job_related":true,"company":"Meta","position":"Software Engineer","status":"Applied"}`,
    description: "Workday ATS - Application confirmation with company extraction"
  },
  {
    input: `From: noreply@greenhouse.io
Subject: Thanks for applying to Stripe!
We've received your application for the Data Scientist, Risk position. Our team will review your qualifications and reach out if there's a potential fit.`,
    output: `{"is_job_related":true,"company":"Stripe","position":"Data Scientist, Risk","status":"Applied"}`,
    description: "Greenhouse ATS - Application received"
  },
  {
    input: `From: recruiting@amazon.com
Subject: Amazon | Phone Interview Invitation
We reviewed your application and would like to invite you for a phone interview for the Senior Product Manager - AWS position. Please use the link below to schedule.`,
    output: `{"is_job_related":true,"company":"Amazon","position":"Senior Product Manager - AWS","status":"Interview"}`,
    description: "Interview invitation with specific role"
  },
  {
    input: `From: talent@spotify.com
Subject: Update on your application
Thank you for your interest in Spotify. After careful consideration, we've decided to move forward with other candidates for the Backend Engineer position. We encourage you to apply for future opportunities.`,
    output: `{"is_job_related":true,"company":"Spotify","position":"Backend Engineer","status":"Declined"}`,
    description: "Polite rejection with position mentioned"
  },
  {
    input: `From: careers@databricks.com
Subject: Your Application Status - ML Engineer Role
Unfortunately, we won't be moving forward with your application at this time. The competition for the ML Engineer position was particularly strong.`,
    output: `{"is_job_related":true,"company":"Databricks","position":"ML Engineer","status":"Declined"}`,
    description: "Rejection with 'unfortunately' keyword"
  },
  {
    input: `From: no-reply@hackerrank.com
Subject: Invitation to take Google's Coding Assessment
Google has invited you to complete a coding assessment for the Software Engineer, L4 position. You have 7 days to complete this 90-minute assessment.`,
    output: `{"is_job_related":true,"company":"Google","position":"Software Engineer, L4","status":"Interview"}`,
    description: "Coding assessment invitation"
  },
  {
    input: `From: offers@netflix.com
Subject: Netflix Offer Letter - Senior iOS Engineer
Congratulations! We're excited to offer you the Senior iOS Engineer position with a base salary of $350,000 and equity package. Please review the attached offer letter.`,
    output: `{"is_job_related":true,"company":"Netflix","position":"Senior iOS Engineer","status":"Offer"}`,
    description: "Job offer with compensation details"
  }
];

export const MistralPromptEditor: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [examples, setExamples] = useState<PromptExample[]>(DEFAULT_EXAMPLES);
  const [rules, setRules] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{
    promptTokens: number;
    contextSize: number;
    availableTokens: number;
    usagePercent: number;
    warning: string | null;
    status: 'good' | 'warning' | 'danger';
  } | null>(null);

  // Load current prompt on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    loadPrompt();
  }, []);

  // Track changes and update token info
  useEffect(() => {
    const currentPrompt = buildFullPrompt();
    setHasChanges(currentPrompt !== originalPrompt);
    
    // Update token info
    if (window.electronAPI) {
      window.electronAPI.getTokenInfo(currentPrompt).then(info => {
        setTokenInfo(info);
      }).catch(err => {
        console.error('Error getting token info:', err);
      });
    }
  }, [systemPrompt, examples, rules, originalPrompt]);

  const loadPrompt = async () => {
    if (!window.electronAPI) return;
    
    setLoading(true);
    setError('');
    
    try {
      const result = await window.electronAPI.getPrompt();
      if (result.success) {
        // Parse the prompt to extract components
        parsePrompt(result.prompt);
        setOriginalPrompt(result.prompt);
      } else {
        setError('Failed to load prompt');
      }
    } catch (err) {
      setError('Error loading prompt: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const parsePrompt = (prompt: string) => {
    // Extract system instruction
    const instMatch = prompt.match(/\[INST\](.*?)(?=Examples of correct classification:|$)/s);
    if (instMatch) {
      setSystemPrompt(instMatch[1].trim());
    }

    // Extract examples
    const examplesMatch = prompt.match(/Examples of correct classification:(.*?)(?=Classification rules:|$)/s);
    if (examplesMatch) {
      const examplesText = examplesMatch[1];
      const examplePairs = examplesText.split(/(?=Email:)/g).filter(e => e.trim());
      const parsedExamples = examplePairs.map(pair => {
        const inputMatch = pair.match(/Email:\s*"([^"]+)"/s);
        const outputMatch = pair.match(/Output:\s*({[^}]+})/);
        return {
          input: inputMatch ? inputMatch[1] : '',
          output: outputMatch ? outputMatch[1] : '',
          description: ''
        };
      }).filter(e => e.input && e.output);
      if (parsedExamples.length > 0) {
        setExamples(parsedExamples);
      }
    }

    // Extract rules
    const rulesMatch = prompt.match(/Classification rules:(.*?)(?=Analyze this email|$)/s);
    if (rulesMatch) {
      setRules(rulesMatch[1].trim());
    }
  };

  const buildFullPrompt = (): string => {
    let prompt = `[INST] ${systemPrompt}\n\n`;
    
    if (examples.length > 0) {
      prompt += 'Examples of correct classification:\n\n';
      examples.forEach(ex => {
        prompt += `Email: "${ex.input}"\nOutput: ${ex.output}\n\n`;
      });
    }

    if (rules) {
      prompt += `Classification rules:\n${rules}\n\n`;
    }

    prompt += 'Analyze this email and output JSON:\n[/INST]';
    
    return prompt;
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
    
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const fullPrompt = buildFullPrompt();
      const result = await window.electronAPI.setPrompt(fullPrompt);
      if (result.success) {
        setSuccess('Prompt saved successfully! The LLM will use your custom prompt for future classifications.');
        setOriginalPrompt(fullPrompt);
        setHasChanges(false);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(result.error || 'Failed to save prompt');
      }
    } catch (err) {
      setError('Error saving prompt: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.electronAPI) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const result = await window.electronAPI.resetPrompt();
      if (result.success) {
        parsePrompt(result.prompt);
        setOriginalPrompt(result.prompt);
        setHasChanges(false);
        setSuccess('Prompt reset to default successfully!');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError('Failed to reset prompt');
      }
    } catch (err) {
      setError('Error resetting prompt: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleTestPrompt = async () => {
    if (!window.electronAPI || !testEmail) return;
    
    setTesting(true);
    setTestResult('');
    
    try {
      // Parse the test email
      const lines = testEmail.split('\n');
      const subject = lines.find(l => l.startsWith('Subject:'))?.replace('Subject:', '').trim() || '';
      const from = lines.find(l => l.startsWith('From:'))?.replace('From:', '').trim() || '';
      const body = lines.slice(lines.findIndex(l => l.startsWith('Body:')) + 1).join('\n').trim();
      
      // Test with current prompt
      const result = await window.electronAPI.testPrompt({
        prompt: buildFullPrompt(),
        email: { subject, from, body }
      });
      
      if (result.success) {
        setTestResult(JSON.stringify(result.result, null, 2));
      } else {
        setTestResult(`Error: ${result.error}`);
      }
    } catch (err) {
      setTestResult('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setTesting(false);
    }
  };

  const addExample = () => {
    setExamples([...examples, { input: '', output: '', description: '' }]);
  };

  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  const updateExample = (index: number, field: keyof PromptExample, value: string) => {
    const updated = [...examples];
    updated[index] = { ...updated[index], [field]: value };
    setExamples(updated);
  };

  return (
    <Card sx={{ borderRadius: 3, boxShadow: 2, mb: 3, border: "1px solid", borderColor: "primary.light" }}>
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Psychology sx={{ color: onlyJobsTheme.palette.primary.main }} />
            <Typography variant="h3" sx={{ fontWeight: 600 }}>
              Mistral-7B Classification Prompt
            </Typography>
            <Chip 
              label="Few-Shot Learning" 
              color="primary" 
              size="small" 
              icon={<CheckCircle />}
            />
          </Box>
          <Tooltip title="Help & Best Practices">
            <IconButton onClick={() => setHelpOpen(true)}>
              <Help />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Customize the Mistral-7B instruction prompt for email classification. Uses few-shot learning with examples.
        </Typography>

        {/* Token Usage Display */}
        {tokenInfo && (
          <Paper sx={{ 
            p: 2, 
            mb: 3, 
            backgroundColor: 
              tokenInfo.status === 'good' ? 'success.light' : 
              tokenInfo.status === 'warning' ? 'warning.light' : 'error.light',
            bgcolor: (theme) => 
              tokenInfo.status === 'good' ? `${theme.palette.success.main}10` : 
              tokenInfo.status === 'warning' ? `${theme.palette.warning.main}10` : 
              `${theme.palette.error.main}10`,
            border: '1px solid',
            borderColor: 
              tokenInfo.status === 'good' ? 'success.main' : 
              tokenInfo.status === 'warning' ? 'warning.main' : 'error.main'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Memory sx={{ 
                  color: 
                    tokenInfo.status === 'good' ? 'success.main' : 
                    tokenInfo.status === 'warning' ? 'warning.main' : 'error.main' 
                }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Token Usage: {tokenInfo.promptTokens} / {tokenInfo.contextSize}
                </Typography>
                <Chip 
                  label={`${tokenInfo.usagePercent}%`}
                  size="small"
                  color={
                    tokenInfo.status === 'good' ? 'success' : 
                    tokenInfo.status === 'warning' ? 'warning' : 'error'
                  }
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {tokenInfo.availableTokens} tokens available for email
              </Typography>
            </Box>
            
            <LinearProgress 
              variant="determinate" 
              value={tokenInfo.usagePercent} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 
                    tokenInfo.status === 'good' ? 'success.main' : 
                    tokenInfo.status === 'warning' ? 'warning.main' : 'error.main'
                }
              }}
            />
            
            {tokenInfo.warning && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Warning sx={{ fontSize: 16, color: 'warning.main' }} />
                <Typography variant="caption" color="warning.main">
                  {tokenInfo.warning}
                </Typography>
              </Box>
            )}
          </Paper>
        )}

        {/* Status Messages */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
            {success}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label="System Instruction" icon={<EditNote />} iconPosition="start" />
              <Tab label="Examples" icon={<Code />} iconPosition="start" />
              <Tab label="Rules" icon={<Info />} iconPosition="start" />
              <Tab label="Test" icon={<Psychology />} iconPosition="start" />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <TextField
                multiline
                fullWidth
                rows={6}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                variant="outlined"
                placeholder="Enter the main instruction for the model..."
                label="System Instruction"
                helperText="The main task description. Keep it clear and concise."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                  }
                }}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6">Few-Shot Examples</Typography>
                  <Chip 
                    label={`${examples.length} examples`} 
                    size="small"
                    color={examples.length > 10 ? 'warning' : 'default'}
                  />
                  {examples.length > 10 && (
                    <Typography variant="caption" color="warning.main">
                      Consider reducing to 8 or fewer for optimal token usage
                    </Typography>
                  )}
                </Box>
                <Button
                  startIcon={<Add />}
                  onClick={addExample}
                  variant="outlined"
                  size="small"
                  disabled={examples.length >= 15}
                >
                  Add Example
                </Button>
              </Box>
              
              {examples.map((example, index) => (
                <Paper key={index} sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2">Example {index + 1}</Typography>
                    <IconButton size="small" onClick={() => removeExample(index)}>
                      <Delete />
                    </IconButton>
                  </Box>
                  
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={example.input}
                    onChange={(e) => updateExample(index, 'input', e.target.value)}
                    label="Input Email"
                    placeholder="From: ...\nSubject: ...\nBody content..."
                    sx={{ mb: 2, fontFamily: 'monospace' }}
                  />
                  
                  <TextField
                    fullWidth
                    value={example.output}
                    onChange={(e) => updateExample(index, 'output', e.target.value)}
                    label="Expected JSON Output"
                    placeholder='{"is_job_related":true,"company":"Example","position":"Engineer","status":"Applied"}'
                    sx={{ mb: 1, fontFamily: 'monospace' }}
                  />
                  
                  <TextField
                    fullWidth
                    value={example.description}
                    onChange={(e) => updateExample(index, 'description', e.target.value)}
                    label="Description (optional)"
                    placeholder="What this example demonstrates..."
                    size="small"
                  />
                </Paper>
              ))}
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <TextField
                multiline
                fullWidth
                rows={10}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                variant="outlined"
                label="Classification Rules"
                placeholder="Enter classification rules and guidelines..."
                helperText="Define specific rules for status detection, company extraction, etc."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                  }
                }}
              />
            </TabPanel>

            <TabPanel value={tabValue} index={3}>
              <Typography variant="h6" sx={{ mb: 2 }}>Test Your Prompt</Typography>
              
              <TextField
                multiline
                fullWidth
                rows={6}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                variant="outlined"
                label="Test Email"
                placeholder="From: careers@example.com\nSubject: Application Received\nBody: Thank you for applying..."
                sx={{ mb: 2, fontFamily: 'monospace' }}
              />
              
              <Button
                variant="contained"
                onClick={handleTestPrompt}
                disabled={testing || !testEmail}
                startIcon={testing ? <CircularProgress size={20} /> : <Psychology />}
                sx={{ mb: 2 }}
              >
                {testing ? 'Testing...' : 'Test Classification'}
              </Button>
              
              {testResult && (
                <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Result:</Typography>
                  <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {testResult}
                  </pre>
                </Paper>
              )}
            </TabPanel>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={loading || saving}
                startIcon={<RestartAlt />}
                sx={{
                  borderRadius: 2,
                  px: 3,
                  py: 1,
                  textTransform: "none",
                }}
              >
                Reset to Default
              </Button>
              
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={loading || saving || !hasChanges}
                startIcon={saving ? <CircularProgress size={20} /> : <Save />}
                sx={{
                  borderRadius: 2,
                  px: 3,
                  py: 1,
                  textTransform: "none",
                }}
              >
                {saving ? 'Saving...' : 'Save Prompt'}
              </Button>
            </Box>
          </>
        )}
      </CardContent>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Help />
            Mistral-7B Prompt Best Practices
          </Box>
        </DialogTitle>
        <DialogContent>
          <List>
            <ListItem>
              <ListItemText
                primary="Use [INST]...[/INST] Format"
                secondary="Mistral-7B-Instruct requires prompts wrapped in [INST] tags for proper instruction following."
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Few-Shot Learning & Token Limits"
                secondary="Provide 5-8 diverse examples. With 2048 token context, aim to use <60% for prompt, leaving 40% for email content. More examples = better accuracy but less room for emails."
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Clear JSON Schema"
                secondary="Always specify the exact JSON structure expected with proper types and null handling."
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Priority Rules"
                secondary="Define clear priority when multiple statuses apply (e.g., Declined > Applied if rejection after application)."
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Company Name Normalization"
                secondary="Include rules for cleaning company names (remove Inc., Ltd., etc.) for consistency."
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="ATS Detection"
                secondary="Include examples for Workday, Greenhouse, and other ATS systems' automated emails."
              />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};