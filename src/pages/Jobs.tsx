import React, { useState } from "react";
import {
  Box,
  CssBaseline,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import { Work as WorkIcon } from '@mui/icons-material';

// Import layout components
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";

// Import JobsList component
import JobsList from "../components/JobsList";

// Import auth context
import { useAuth } from "../contexts/ElectronAuthContext";

export default function Jobs() {
  const authData = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: "", 
    severity: "success" as "success" | "error" 
  });

  const currentUser = authData.currentUser;
  const logout = authData.signOut;

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
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
              currentUser={currentUser} 
              onLogout={handleLogout}
              title="Jobs"
            />
          </Box>

          {/* Main Content */}
          <Box 
            sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}
            className="page-enter gpu-accelerated"
          >
            {/* Page Header */}
            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h2"
                sx={{
                  mb: 2,
                  fontWeight: 600,
                  color: onlyJobsTheme.palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <WorkIcon sx={{ fontSize: '2rem' }} />
                Job Applications
              </Typography>
              <Typography variant="body1" color="text.secondary">
                View and manage all your job applications in one place. Track application status, dates, and details.
              </Typography>
            </Box>
            
            {/* Jobs List Card */}
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: onlyJobsTheme.palette.text.primary 
                  }}
                >
                  Recent Applications
                </Typography>
                <JobsList />
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Snackbar for feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            onClose={handleSnackbarClose} 
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}