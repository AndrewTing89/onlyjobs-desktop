import React, { useState } from "react";
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
  DialogActions
} from "@mui/material";
import { 
  DeleteForever,
  Storage,
  Clear,
  History,
  Work,
  RateReview
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';

// Import layout components
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';

// Import auth contexts
import { useAuth } from "../contexts/ElectronAuthContext";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const isElectron = !!window.electronAPI;
  
  // Use appropriate auth context
  const { currentUser, signOut } = useAuth();
  
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearEmailSyncDialogOpen, setClearEmailSyncDialogOpen] = useState(false);
  const [clearClassificationsDialogOpen, setClearClassificationsDialogOpen] = useState(false);
  const [clearJobDataDialogOpen, setClearJobDataDialogOpen] = useState(false);
  const [clearingAllRecords, setClearingAllRecords] = useState(false);
  const [clearingEmailSync, setClearingEmailSync] = useState(false);
  const [clearingClassifications, setClearingClassifications] = useState(false);
  const [clearingJobData, setClearingJobData] = useState(false);

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };



  const handleDeleteAccount = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDeleteAccount = async () => {
    // This would call a backend endpoint to delete user data in real implementation
    setDeleteDialogOpen(false);
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      setError("Failed to delete account. Please try again.");
    }
  };


  // Database management handlers
  const handleClearAllRecords = () => {
    setClearAllDialogOpen(true);
  };

  const handleClearEmailSync = () => {
    setClearEmailSyncDialogOpen(true);
  };

  const handleClearClassifications = () => {
    setClearClassificationsDialogOpen(true);
  };

  const handleClearJobData = () => {
    setClearJobDataDialogOpen(true);
  };

  const confirmClearAllRecords = async () => {
    setClearAllDialogOpen(false);
    
    // Check if we're in Electron environment
    if (!window.electronAPI) {
      setError("Database management is only available in the desktop application");
      return;
    }

    try {
      setClearingAllRecords(true);
      setError("");
      setMessage("");

      const result = await window.electronAPI.clearAllRecords();
      
      if (result.success) {
        setMessage(result.message);
      } else {
        setError("Failed to clear database records");
      }
    } catch (err) {
      setError("Error clearing database records: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setClearingAllRecords(false);
    }
  };

  const confirmClearEmailSync = async () => {
    setClearEmailSyncDialogOpen(false);
    
    // Check if we're in Electron environment
    if (!window.electronAPI) {
      setError("Database management is only available in the desktop application");
      return;
    }

    try {
      setClearingEmailSync(true);
      setError("");
      setMessage("");

      const result = await window.electronAPI.clearEmailSync();
      
      if (result.success) {
        setMessage(result.message);
      } else {
        setError("Failed to clear email sync history");
      }
    } catch (err) {
      setError("Error clearing email sync history: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setClearingEmailSync(false);
    }
  };

  const confirmClearClassifications = async () => {
    setClearClassificationsDialogOpen(false);
    
    // Check if we're in Electron environment
    if (!window.electronAPI) {
      setError("Database management is only available in the desktop application");
      return;
    }

    try {
      setClearingClassifications(true);
      setError("");
      setMessage("");

      const result = await window.electronAPI.clearClassifications();
      
      if (result.success) {
        setMessage(result.message);
      } else {
        setError("Failed to clear classification data");
      }
    } catch (err) {
      setError("Error clearing classification data: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setClearingClassifications(false);
    }
  };

  const confirmClearJobData = async () => {
    setClearJobDataDialogOpen(false);
    
    // Check if we're in Electron environment
    if (!window.electronAPI) {
      setError("Database management is only available in the desktop application");
      return;
    }

    try {
      setClearingJobData(true);
      setError("");
      setMessage("");

      const result = await window.electronAPI.clearJobData();
      
      if (result.success) {
        setMessage("Job data cleared successfully. Gmail accounts remain connected.");
      } else {
        setError("Failed to clear job data");
      }
    } catch (err) {
      setError("Error clearing job data: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setClearingJobData(false);
    }
  };

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: "flex", height: "100vh" }}>
        <CssBaseline />

        {/* Sidebar Navigation */}
        <Sidebar currentPath={location.pathname} />

        {/* Main Content Area */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <Box sx={{ p: 3, pb: 0 }}>
            <TopBar 
              currentUser={{
                displayName: currentUser?.name || 'User',
                email: currentUser?.email || 'user@example.com'
              }} 
              onLogout={handleLogout}
              title="Settings"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            {/* Status Messages */}
            {message && (
              <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                {message}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}



            {/* ML Classifier Section - Electron Only */}

            {/* Database Management Section - Electron Only */}
            {isElectron && (
              <Card sx={{ borderRadius: 3, boxShadow: 2, mb: 3, border: "1px solid", borderColor: "warning.light" }}>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                    <Storage sx={{ color: onlyJobsTheme.palette.primary.main, mr: 2 }} />
                    <Typography variant="h3" sx={{ fontWeight: 600 }}>
                      Database Management
                    </Typography>
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {/* Clear Email Sync History */}
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Box>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                          Clear Email Sync History
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Remove email sync tracking data. This allows emails to be re-processed but keeps your job records intact.
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        onClick={handleClearEmailSync}
                        disabled={clearingEmailSync}
                        startIcon={clearingEmailSync ? <CircularProgress size={20} /> : <History />}
                        color="warning"
                        sx={{
                          borderRadius: 2,
                          px: 3,
                          py: 1,
                          textTransform: "none",
                          width: "200px",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {clearingEmailSync ? "Clearing..." : "Clear Sync History"}
                      </Button>
                    </Box>

                    {/* Clear Classifications Only */}
                    <Box sx={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      pt: 2, 
                      borderTop: "1px solid", 
                      borderColor: "divider" 
                    }}>
                      <Box>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                          Clear Classifications Only
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Remove pending classifications and training data. Emails can be re-classified without re-fetching.
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        onClick={handleClearClassifications}
                        disabled={clearingClassifications}
                        startIcon={clearingClassifications ? <CircularProgress size={20} /> : <RateReview />}
                        color="warning"
                        sx={{
                          borderRadius: 2,
                          px: 3,
                          py: 1,
                          textTransform: "none",
                          width: "200px",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {clearingClassifications ? "Clearing..." : "Clear Classifications"}
                      </Button>
                    </Box>

                    {/* Clear Job Data Only */}
                    <Box sx={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      pt: 2, 
                      borderTop: "1px solid", 
                      borderColor: "divider" 
                    }}>
                      <Box>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                          Clear Job Data
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Remove all job applications and email sync history, but keep Gmail account connections intact.
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        onClick={handleClearJobData}
                        disabled={clearingJobData}
                        startIcon={clearingJobData ? <CircularProgress size={20} /> : <Work />}
                        color="warning"
                        sx={{
                          borderRadius: 2,
                          px: 3,
                          py: 1,
                          textTransform: "none",
                          width: "200px",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {clearingJobData ? "Clearing..." : "Clear Job Data"}
                      </Button>
                    </Box>

                    {/* Clear Everything Including Gmail Accounts */}
                    <Box sx={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      pt: 2, 
                      borderTop: "1px solid", 
                      borderColor: "divider" 
                    }}>
                      <Box>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                          Clear Everything (Including Gmail Accounts)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Reset the entire database to a clean state. This removes all data AND Gmail account connections.
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        onClick={handleClearAllRecords}
                        disabled={clearingAllRecords}
                        startIcon={clearingAllRecords ? <CircularProgress size={20} /> : <Clear />}
                        color="error"
                        sx={{
                          borderRadius: 2,
                          px: 3,
                          py: 1,
                          textTransform: "none",
                          width: "200px",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {clearingAllRecords ? "Clearing..." : "Clear Everything"}
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Danger Zone */}
            <Card sx={{ borderRadius: 3, boxShadow: 2, border: "1px solid", borderColor: "error.light" }}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                  <DeleteForever sx={{ color: "error.main", mr: 2 }} />
                  <Typography variant="h3" sx={{ color: "error.main", fontWeight: 600 }}>
                    Danger Zone
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                      Delete Account
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={handleDeleteAccount}
                    startIcon={<DeleteForever />}
                    color="error"
                    sx={{
                      borderRadius: 2,
                      px: 3,
                      py: 1,
                      textTransform: "none",
                    }}
                  >
                    Delete Account
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "error.main" }}>
          Delete Account
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete your account? This will permanently remove:
            <br />• All your job application data
            <br />• Your profile information
            <br />• Gmail integration settings
            <br />• All analytics and insights
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setDeleteDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmDeleteAccount}
            variant="contained"
            color="error"
          >
            Delete Account
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Records Confirmation Dialog */}
      <Dialog
        open={clearAllDialogOpen}
        onClose={() => setClearAllDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "error.main" }}>
          Clear All Database Records
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all database records? This will permanently remove:
            <br />• All job applications and their details
            <br />• All email sync tracking history
            <br />• All connected Gmail account information
            <br />• All sync statistics and status data
            <br /><br />
            You will need to reconnect your Gmail accounts and re-sync your emails after this operation.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setClearAllDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearAllRecords}
            variant="contained"
            color="error"
          >
            Clear All Records
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Email Sync Confirmation Dialog */}
      <Dialog
        open={clearEmailSyncDialogOpen}
        onClose={() => setClearEmailSyncDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "warning.main" }}>
          Clear Email Sync History
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear the email sync history? This will:
            <br />• Remove all email processing tracking data
            <br />• Allow previously processed emails to be re-analyzed
            <br />• Reset sync statistics (emails fetched/classified counters)
            <br /><br />
            Your job records will be kept intact, but emails may be processed again during the next sync.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setClearEmailSyncDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearEmailSync}
            variant="contained"
            color="warning"
          >
            Clear Sync History
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Classifications Confirmation Dialog */}
      <Dialog
        open={clearClassificationsDialogOpen}
        onClose={() => setClearClassificationsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "warning.main" }}>
          Clear Classifications Only
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear classification data? This will:
            <br />• Remove all pending classifications from the queue
            <br />• Clear ML/LLM training feedback data
            <br />• Delete cached classification results
            <br /><br />
            Your email sync history and job records will remain intact. Emails can be re-classified without re-fetching.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setClearClassificationsDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearClassifications}
            variant="contained"
            color="warning"
          >
            Clear Classifications
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Job Data Confirmation Dialog */}
      <Dialog
        open={clearJobDataDialogOpen}
        onClose={() => setClearJobDataDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "warning.main" }}>
          Clear Job Data
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all job data? This will:
            <br />• Remove all job applications and their details
            <br />• Clear email sync tracking history  
            <br />• Reset sync statistics
            <br /><br />
            <strong>Gmail account connections will be preserved.</strong> You won't need to sign in again.
            <br /><br />
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setClearJobDataDialogOpen(false)}
            color="inherit"
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearJobData}
            variant="contained"
            color="warning"
          >
            Clear Job Data
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}