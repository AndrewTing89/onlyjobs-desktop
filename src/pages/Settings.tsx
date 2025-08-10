import React, { useState } from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  TextField,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from "@mui/material";
import { 
  Person, 
  Notifications, 
  DeleteForever,
  ArrowBack,
  Code,
  Storage,
  Clear,
  History
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth, getAuthErrorMessage } from "../contexts/AuthContext";
import { AuthError } from "firebase/auth";
import { GmailConnection } from "../components/GmailConnection";
import { SyncStatus } from "../components/SyncStatus";

const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, updateUserProfile, logout, getIdToken, isGmailConnected, checkGmailConnection } = useAuth();
  
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearEmailSyncDialogOpen, setClearEmailSyncDialogOpen] = useState(false);
  const [clearingAllRecords, setClearingAllRecords] = useState(false);
  const [clearingEmailSync, setClearingEmailSync] = useState(false);
  
  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailUpdates: true,
    applicationReminders: true,
    weeklyDigest: false
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      setError("Display name cannot be empty");
      return;
    }

    try {
      setError("");
      setMessage("");
      setLoading(true);
      await updateUserProfile(displayName.trim());
      setMessage("Profile updated successfully!");
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  const handleGmailConnectionChange = async (connected: boolean) => {
    // Refresh Gmail connection status from backend
    await checkGmailConnection();
    
    if (connected) {
      setMessage("Gmail connected successfully! Your emails will now be processed for job application tracking.");
    } else {
      setMessage("Gmail disconnected successfully!");
    }
  };

  const handleDeleteAccount = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDeleteAccount = async () => {
    // This would call a backend endpoint to delete user data in real implementation
    setDeleteDialogOpen(false);
    try {
      await logout();
      navigate("/");
    } catch (err) {
      setError("Failed to delete account. Please try again.");
    }
  };

  const handleGetFirebaseToken = async () => {
    if (!currentUser) {
      setError("No user logged in");
      return;
    }

    try {
      setFetchingToken(true);
      setError("");
      setMessage("");
      
      const token = await getIdToken();
      if (token) {
        console.log("=== Firebase ID Token for Backend Testing ===");
        console.log(token);
        console.log("=== Copy the token above to test backend endpoints ===");
        setMessage("Firebase ID token logged to console! Check the browser console and copy the token for backend testing.");
      } else {
        setError("Failed to get Firebase ID token");
      }
    } catch (err) {
      setError("Error getting Firebase ID token: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setFetchingToken(false);
    }
  };

  // Database management handlers
  const handleClearAllRecords = () => {
    setClearAllDialogOpen(true);
  };

  const handleClearEmailSync = () => {
    setClearEmailSyncDialogOpen(true);
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

  return (
    <Box sx={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <CssBaseline />
      
      <Container maxWidth="md" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/dashboard')}
            sx={{
              mb: 2,
              color: '#666',
              textTransform: 'none',
              fontSize: '14px',
              '&:hover': {
                backgroundColor: 'rgba(0,0,0,0.04)',
                color: textColor,
              },
            }}
          >
            Back to Dashboard
          </Button>
          <Typography variant="h4" sx={{ color: textColor, fontWeight: 700, mb: 1 }}>
            Account Settings
          </Typography>
          <Typography variant="body1" sx={{ color: "#666" }}>
            Manage your account preferences and integrations
          </Typography>
        </Box>

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

        {/* Profile Section */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1, mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <Person sx={{ color: accent, mr: 2 }} />
              <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
                Profile Information
              </Typography>
            </Box>

            <Box component="form" onSubmit={handleUpdateProfile}>
              <TextField
                fullWidth
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: accent,
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: accent,
                  },
                }}
              />

              <TextField
                fullWidth
                label="Email Address"
                value={currentUser?.email || ""}
                disabled
                helperText="Email cannot be changed"
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                  },
                }}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : null}
                sx={{
                  background: accent,
                  borderRadius: 2,
                  px: 3,
                  py: 1,
                  textTransform: "none",
                  boxShadow: "none",
                  "&:hover": {
                    background: accent,
                    boxShadow: "none",
                  },
                }}
              >
                {loading ? "Updating..." : "Update Profile"}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Gmail Integration Section */}
        <Box sx={{ mb: 3 }}>
          <GmailConnection
            isConnected={isGmailConnected}
            onConnectionChange={handleGmailConnectionChange}
            onGlobalRefresh={checkGmailConnection}
          />
        </Box>

        {/* Sync Status Section */}
        {isGmailConnected && (
          <Box sx={{ mb: 3 }}>
            <SyncStatus isConnected={isGmailConnected} />
          </Box>
        )}

        {/* Notification Preferences */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1, mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <Notifications sx={{ color: accent, mr: 2 }} />
              <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
                Notification Preferences
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.emailUpdates}
                    onChange={(e) => setNotifications({...notifications, emailUpdates: e.target.checked})}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: accent,
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: accent,
                      },
                    }}
                  />
                }
                label="Email notifications for application updates"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.applicationReminders}
                    onChange={(e) => setNotifications({...notifications, applicationReminders: e.target.checked})}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: accent,
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: accent,
                      },
                    }}
                  />
                }
                label="Reminders for follow-up actions"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={notifications.weeklyDigest}
                    onChange={(e) => setNotifications({...notifications, weeklyDigest: e.target.checked})}
                    sx={{
                      "& .MuiSwitch-switchBase.Mui-checked": {
                        color: accent,
                      },
                      "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                        backgroundColor: accent,
                      },
                    }}
                  />
                }
                label="Weekly summary digest"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Developer Tools Section */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1, mb: 3, border: "1px solid #e3f2fd" }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <Code sx={{ color: accent, mr: 2 }} />
              <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
                Developer Tools
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Typography variant="body1" sx={{ color: textColor, mb: 1 }}>
                  Get Firebase ID Token
                </Typography>
                <Typography variant="body2" sx={{ color: "#666" }}>
                  Logs your current Firebase ID token to the console for backend testing and debugging.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={handleGetFirebaseToken}
                disabled={fetchingToken || !currentUser}
                startIcon={fetchingToken ? <CircularProgress size={20} /> : <Code />}
                sx={{
                  borderColor: accent,
                  color: accent,
                  borderRadius: 2,
                  px: 3,
                  py: 1,
                  textTransform: "none",
                  "&:hover": {
                    borderColor: accent,
                    background: `${accent}10`,
                  },
                  "&:disabled": {
                    borderColor: "#ccc",
                    color: "#ccc",
                  },
                }}
              >
                {fetchingToken ? "Getting Token..." : "Get Token"}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Database Management Section - Only show in Electron */}
        {window.electronAPI && (
          <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1, mb: 3, border: "1px solid #fff3e0" }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Storage sx={{ color: accent, mr: 2 }} />
                <Typography variant="h6" sx={{ color: textColor, fontWeight: 600 }}>
                  Database Management
                </Typography>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {/* Clear Email Sync History */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body1" sx={{ color: textColor, mb: 1 }}>
                      Clear Email Sync History
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#666" }}>
                      Remove email sync tracking data. This allows emails to be re-processed but keeps your job records intact.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={handleClearEmailSync}
                    disabled={clearingEmailSync}
                    startIcon={clearingEmailSync ? <CircularProgress size={20} /> : <History />}
                    sx={{
                      borderColor: "#ff9800",
                      color: "#ff9800",
                      borderRadius: 2,
                      px: 3,
                      py: 1,
                      textTransform: "none",
                      minWidth: "160px",
                      "&:hover": {
                        borderColor: "#ff9800",
                        background: "#fff3e0",
                      },
                      "&:disabled": {
                        borderColor: "#ccc",
                        color: "#ccc",
                      },
                    }}
                  >
                    {clearingEmailSync ? "Clearing..." : "Clear Sync History"}
                  </Button>
                </Box>

                {/* Clear All Records */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pt: 2, borderTop: "1px solid #f0f0f0" }}>
                  <Box>
                    <Typography variant="body1" sx={{ color: textColor, mb: 1 }}>
                      Clear All Database Records
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#666" }}>
                      Reset the entire database to a clean state. This removes all jobs, email sync history, and Gmail account connections.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={handleClearAllRecords}
                    disabled={clearingAllRecords}
                    startIcon={clearingAllRecords ? <CircularProgress size={20} /> : <Clear />}
                    sx={{
                      borderColor: "#f44336",
                      color: "#f44336",
                      borderRadius: 2,
                      px: 3,
                      py: 1,
                      textTransform: "none",
                      minWidth: "160px",
                      "&:hover": {
                        borderColor: "#f44336",
                        background: "#ffebee",
                      },
                      "&:disabled": {
                        borderColor: "#ccc",
                        color: "#ccc",
                      },
                    }}
                  >
                    {clearingAllRecords ? "Clearing..." : "Clear All Records"}
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Danger Zone */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 1, border: "1px solid #ffebee" }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <DeleteForever sx={{ color: "#d32f2f", mr: 2 }} />
              <Typography variant="h6" sx={{ color: "#d32f2f", fontWeight: 600 }}>
                Danger Zone
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box>
                <Typography variant="body1" sx={{ color: textColor, mb: 1 }}>
                  Delete Account
                </Typography>
                <Typography variant="body2" sx={{ color: "#666" }}>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={handleDeleteAccount}
                startIcon={<DeleteForever />}
                sx={{
                  borderColor: "#d32f2f",
                  color: "#d32f2f",
                  borderRadius: 2,
                  px: 3,
                  py: 1,
                  textTransform: "none",
                  "&:hover": {
                    borderColor: "#d32f2f",
                    background: "#ffebee",
                  },
                }}
              >
                Delete Account
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Navigation */}
        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Button
            variant="text"
            onClick={() => navigate("/dashboard")}
            sx={{
              color: accent,
              textTransform: "none",
              "&:hover": {
                background: "transparent",
                textDecoration: "underline",
              },
            }}
          >
            ← Back to Dashboard
          </Button>
        </Box>
      </Container>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: "#d32f2f" }}>
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
            sx={{ color: "#666" }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmDeleteAccount}
            variant="contained"
            sx={{ 
              background: "#d32f2f",
              "&:hover": { background: "#d32f2f" }
            }}
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
        <DialogTitle sx={{ color: "#f44336" }}>
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
            sx={{ color: "#666" }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearAllRecords}
            variant="contained"
            sx={{ 
              background: "#f44336",
              "&:hover": { background: "#d32f2f" }
            }}
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
        <DialogTitle sx={{ color: "#ff9800" }}>
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
            sx={{ color: "#666" }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmClearEmailSync}
            variant="contained"
            sx={{ 
              background: "#ff9800",
              "&:hover": { background: "#f57c00" }
            }}
          >
            Clear Sync History
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 