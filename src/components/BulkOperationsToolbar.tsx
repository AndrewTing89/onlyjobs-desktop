import React, { useState } from 'react';
import {
  Box,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Checkbox,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Alert
} from '@mui/material';
import {
  SelectAll,
  Clear,
  Check,
  Close,
  Schedule,
  AutoAwesome,
  MoreVert,
  Business,
  Work
} from '@mui/icons-material';
import { LoadingSpinner } from './LoadingSpinner';
import type { EmailClassification, BulkOperationRequest } from '../types/classification';

interface BulkOperationsToolbarProps {
  selectedEmails: string[];
  totalEmails: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkOperation: (request: BulkOperationRequest) => Promise<void>;
  isProcessing?: boolean;
  enableSmartActions?: boolean;
}

const BulkOperationsToolbar: React.FC<BulkOperationsToolbarProps> = ({
  selectedEmails,
  totalEmails,
  onSelectAll,
  onDeselectAll,
  onBulkOperation,
  isProcessing = false,
  enableSmartActions = true
}) => {
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [smartActionsAnchorEl, setSmartActionsAnchorEl] = useState<null | HTMLElement>(null);
  const [jobDetailsDialogOpen, setJobDetailsDialogOpen] = useState(false);
  const [jobFormData, setJobFormData] = useState({
    company: '',
    position: '',
    status: 'Applied' as EmailClassification['status']
  });

  const hasSelection = selectedEmails.length > 0;
  const isAllSelected = selectedEmails.length === totalEmails;
  const isIndeterminate = selectedEmails.length > 0 && selectedEmails.length < totalEmails;

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleSmartActionsClose = () => {
    setSmartActionsAnchorEl(null);
  };

  const handleBulkApprove = async () => {
    if (!hasSelection) return;
    
    setJobDetailsDialogOpen(true);
    handleMenuClose();
  };

  const handleBulkReject = async () => {
    if (!hasSelection) return;
    
    await onBulkOperation({
      email_ids: selectedEmails,
      operation: 'reject_as_not_job'
    });
    handleMenuClose();
  };

  const handleQueueForParsing = async () => {
    if (!hasSelection) return;
    
    await onBulkOperation({
      email_ids: selectedEmails,
      operation: 'approve_for_extraction',
      metadata: {
        user_classification: 'HIL_approved',
        pipeline_stage: 'ready_for_extraction'
      }
    });
    handleMenuClose();
  };

  const handleJobDetailsSubmit = async () => {
    if (!hasSelection) return;
    
    await onBulkOperation({
      email_ids: selectedEmails,
      operation: 'approve_for_extraction',
      metadata: {
        user_classification: 'HIL_approved',
        pipeline_stage: 'ready_for_extraction',
        user_feedback: jobFormData.company && jobFormData.position 
          ? `Company: ${jobFormData.company}, Position: ${jobFormData.position}` 
          : undefined
      }
    });
    
    setJobDetailsDialogOpen(false);
    setJobFormData({ company: '', position: '', status: 'Applied' });
  };

  const handleSmartAutoApprove = async () => {
    // This would approve all high confidence (>90%) emails
    await onBulkOperation({
      email_ids: [], // Backend would filter by confidence
      operation: 'approve_for_extraction',
      metadata: {
        user_classification: 'HIL_approved',
        pipeline_stage: 'ready_for_extraction'
      }
    });
    handleSmartActionsClose();
  };

  const handleSmartAutoReject = async () => {
    // This would reject all low confidence (<30%) emails
    await onBulkOperation({
      email_ids: [], // Backend would filter by confidence
      operation: 'reject_as_not_job'
    });
    handleSmartActionsClose();
  };

  return (
    <>
      <Toolbar
        sx={{
          pl: 2,
          pr: 2,
          backgroundColor: hasSelection ? 'action.selected' : 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: '64px !important',
          transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          boxShadow: hasSelection ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        {/* Selection Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={isAllSelected ? "Deselect all" : "Select all"}>
            <Checkbox
              indeterminate={isIndeterminate}
              checked={isAllSelected}
              onChange={isAllSelected ? onDeselectAll : onSelectAll}
              disabled={totalEmails === 0 || isProcessing}
              sx={{ 
                color: 'primary.main',
                '&.Mui-checked': { color: 'primary.main' },
                '&.MuiCheckbox-indeterminate': { color: 'primary.main' }
              }}
            />
          </Tooltip>

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {hasSelection 
              ? `${selectedEmails.length} of ${totalEmails} selected`
              : `${totalEmails} emails`
            }
          </Typography>
        </Box>

        {/* Bulk Actions - Only show when emails are selected */}
        {hasSelection && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
            {isProcessing && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                <LoadingSpinner variant="dots" size="small" />
                <Typography variant="body2" color="text.secondary">
                  Processing...
                </Typography>
              </Box>
            )}

            {/* Quick Actions */}
            <Tooltip title="Approve as Jobs">
              <Button
                variant="contained"
                size="small"
                startIcon={<Check />}
                onClick={handleBulkApprove}
                disabled={isProcessing}
                sx={{
                  backgroundColor: 'success.main',
                  color: 'white',
                  '&:hover': { backgroundColor: 'success.dark' }
                }}
              >
                Approve ({selectedEmails.length})
              </Button>
            </Tooltip>

            <Tooltip title="Reject as Not Jobs">
              <Button
                variant="contained"
                size="small"
                startIcon={<Close />}
                onClick={handleBulkReject}
                disabled={isProcessing}
                sx={{
                  backgroundColor: 'error.main',
                  color: 'white',
                  '&:hover': { backgroundColor: 'error.dark' }
                }}
              >
                Reject
              </Button>
            </Tooltip>

            <Tooltip title="Queue for Later Review">
              <IconButton
                onClick={handleQueueForParsing}
                disabled={isProcessing}
                sx={{ color: 'warning.main' }}
              >
                <Schedule />
              </IconButton>
            </Tooltip>

            {/* More Actions Menu */}
            <IconButton
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              disabled={isProcessing}
            >
              <MoreVert />
            </IconButton>
          </Box>
        )}

        {/* Smart Actions - Show when no selection */}
        {!hasSelection && enableSmartActions && (
          <Box sx={{ ml: 'auto' }}>
            <Tooltip title="Smart Auto-Actions">
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoAwesome />}
                onClick={(e) => setSmartActionsAnchorEl(e.currentTarget)}
                disabled={isProcessing || totalEmails === 0}
                sx={{ borderColor: 'primary.main', color: 'primary.main' }}
              >
                Smart Actions
              </Button>
            </Tooltip>
          </Box>
        )}

        {/* Clear Selection */}
        {hasSelection && (
          <Tooltip title="Clear selection">
            <IconButton
              onClick={onDeselectAll}
              size="small"
              sx={{ ml: 1, color: 'text.secondary' }}
            >
              <Clear />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>

      {/* More Actions Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem dense disabled>
          <Typography variant="caption">
            Actions for {selectedEmails.length} emails
          </Typography>
        </MenuItem>
        <Divider />
        
        <MenuItem onClick={handleBulkApprove}>
          <Check sx={{ mr: 1, color: 'success.main' }} />
          Approve as Jobs
        </MenuItem>
        
        <MenuItem onClick={handleBulkReject}>
          <Close sx={{ mr: 1, color: 'error.main' }} />
          Reject as Not Jobs
        </MenuItem>
        
        <MenuItem onClick={handleQueueForParsing}>
          <Schedule sx={{ mr: 1, color: 'warning.main' }} />
          Queue for Parsing
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={() => {
          // Mark for manual review
          onBulkOperation({
            email_ids: selectedEmails,
            operation: 'mark_needs_review'
          });
          handleMenuClose();
        }}>
          <Work sx={{ mr: 1, color: 'info.main' }} />
          Mark for Review
        </MenuItem>
      </Menu>

      {/* Smart Actions Menu */}
      <Menu
        anchorEl={smartActionsAnchorEl}
        open={Boolean(smartActionsAnchorEl)}
        onClose={handleSmartActionsClose}
      >
        <MenuItem dense disabled>
          <Typography variant="caption">Automated Actions</Typography>
        </MenuItem>
        <Divider />
        
        <MenuItem onClick={handleSmartAutoApprove}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Check sx={{ mr: 1, color: 'success.main' }} />
            <Box>
              <Typography variant="body2">Auto-Approve High Confidence</Typography>
              <Typography variant="caption" color="text.secondary">
                Approve emails with &gt;90% confidence
              </Typography>
            </Box>
          </Box>
        </MenuItem>
        
        <MenuItem onClick={handleSmartAutoReject}>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Close sx={{ mr: 1, color: 'error.main' }} />
            <Box>
              <Typography variant="body2">Auto-Reject Low Confidence</Typography>
              <Typography variant="caption" color="text.secondary">
                Reject emails with &lt;30% confidence
              </Typography>
            </Box>
          </Box>
        </MenuItem>
      </Menu>

      {/* Job Details Dialog */}
      <Dialog 
        open={jobDetailsDialogOpen} 
        onClose={() => setJobDetailsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Business sx={{ color: 'primary.main' }} />
            Approve as Job Applications
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Approving {selectedEmails.length} emails as job applications. 
            You can optionally provide common details that will be applied to all emails.
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Company Name (Optional)"
              value={jobFormData.company}
              onChange={(e) => setJobFormData(prev => ({ ...prev, company: e.target.value }))}
              placeholder="e.g. Google, Microsoft..."
              fullWidth
              helperText="Leave blank to use auto-detected company names"
            />

            <TextField
              label="Position (Optional)"
              value={jobFormData.position}
              onChange={(e) => setJobFormData(prev => ({ ...prev, position: e.target.value }))}
              placeholder="e.g. Software Engineer, Product Manager..."
              fullWidth
              helperText="Leave blank to use auto-detected positions"
            />

            <FormControl fullWidth>
              <InputLabel>Application Status</InputLabel>
              <Select
                value={jobFormData.status}
                onChange={(e) => setJobFormData(prev => ({ 
                  ...prev, 
                  status: e.target.value as EmailClassification['status']
                }))}
                label="Application Status"
              >
                <MenuItem value="Applied">Applied</MenuItem>
                <MenuItem value="Interview">Interview</MenuItem>
                <MenuItem value="Offer">Offer</MenuItem>
                <MenuItem value="Declined">Declined</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button 
            onClick={() => setJobDetailsDialogOpen(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleJobDetailsSubmit}
            disabled={isProcessing}
            startIcon={isProcessing ? <LoadingSpinner variant="dots" size="small" /> : <Check />}
          >
            {isProcessing ? 'Processing...' : 'Approve Jobs'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BulkOperationsToolbar;