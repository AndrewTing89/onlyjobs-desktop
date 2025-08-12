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
  Collapse,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  EditNote,
  Save,
  RestartAlt,
  ExpandMore,
  ExpandLess,
  Info,
  CheckCircle
} from '@mui/icons-material';

interface PromptEditorProps {
  isElectron: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({ isElectron }) => {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current prompt on mount
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    
    loadPrompt();
  }, [isElectron]);

  // Track changes
  useEffect(() => {
    setHasChanges(prompt !== originalPrompt);
  }, [prompt, originalPrompt]);

  const loadPrompt = async () => {
    if (!window.electronAPI) return;
    
    setLoading(true);
    setError('');
    
    try {
      const result = await window.electronAPI.getPrompt();
      if (result.success) {
        setPrompt(result.prompt);
        setOriginalPrompt(result.prompt);
        setIsCustom(result.isCustom);
      } else {
        setError('Failed to load prompt');
      }
    } catch (err) {
      setError('Error loading prompt: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
    
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const result = await window.electronAPI.setPrompt(prompt);
      if (result.success) {
        setSuccess('Prompt saved successfully! The LLM will use your custom prompt for future classifications.');
        setOriginalPrompt(prompt);
        setIsCustom(true);
        setHasChanges(false);
        
        // Clear success message after 5 seconds
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
        setPrompt(result.prompt);
        setOriginalPrompt(result.prompt);
        setIsCustom(false);
        setHasChanges(false);
        setSuccess('Prompt reset to default successfully!');
        
        // Clear success message after 5 seconds
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

  const handleGetInfo = async () => {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.getPromptInfo();
      if (result.success) {
        // Show info in a nice format
        const info = `
Model Path: ${result.modelPath}
User Data Directory: ${result.userDataPath}
Prompt File: ${result.promptFilePath}
        `.trim();
        
        // You could show this in a dialog or tooltip
        console.log('Prompt Configuration:', info);
        setSuccess('Configuration info logged to console');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      console.error('Error getting prompt info:', err);
    }
  };

  if (!isElectron) {
    return null; // This feature is only for Electron
  }

  return (
    <Card sx={{ borderRadius: 3, boxShadow: 2, mb: 3, border: "1px solid", borderColor: "primary.light" }}>
      <CardContent sx={{ p: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <EditNote sx={{ color: "primary.main" }} />
            <Typography variant="h3" sx={{ fontWeight: 600 }}>
              LLM Classification Prompt
            </Typography>
            {isCustom && (
              <Chip 
                label="Custom" 
                color="primary" 
                size="small" 
                icon={<CheckCircle />}
              />
            )}
          </Box>
          <IconButton
            onClick={() => setExpanded(!expanded)}
            size="small"
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Customize the prompt used by the local LLM to classify job-related emails. 
          Changes take effect immediately for new email classifications.
        </Typography>

        <Collapse in={expanded} timeout="auto" unmountOnExit>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
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

              {/* Prompt Editor */}
              <TextField
                multiline
                fullWidth
                rows={12}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                variant="outlined"
                placeholder="Enter your custom classification prompt..."
                sx={{
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                  }
                }}
                helperText={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Info fontSize="small" />
                    <span>
                      The prompt should instruct the LLM to output JSON with: is_job_related (boolean), 
                      company (string|null), position (string|null), and status (Applied|Interview|Declined|Offer|null)
                    </span>
                  </Box>
                }
              />

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Tooltip title="Get configuration info">
                  <IconButton onClick={handleGetInfo} size="small">
                    <Info />
                  </IconButton>
                </Tooltip>
                
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  disabled={loading || saving || !isCustom}
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
        </Collapse>

        {/* Collapsed View - Show expand button */}
        {!expanded && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Click to expand and edit the LLM classification prompt
            </Typography>
            <Button
              variant="text"
              onClick={() => setExpanded(true)}
              endIcon={<ExpandMore />}
              sx={{ textTransform: 'none' }}
            >
              Expand
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};