import React, { useState, useEffect } from "react";
import logo from "../company-logo.jpeg";
import {
  Box,
  CssBaseline,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  Snackbar,
  Menu,
  MenuItem,
  IconButton,
  Card,
  CardContent
} from "@mui/material";
import { 
  Home, 
  Settings,
  AccountCircle,
  Logout,
  KeyboardArrowDown,
  Psychology
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { LookerDashboard } from "../components/LookerDashboard";
import GmailConnectionElectron from "../components/GmailConnectionElectron";
import { GmailMultiAccount } from "../components/GmailMultiAccount";
import JobsList from "../components/JobsList";
// Import the appropriate auth context based on environment
import { useAuth as useFirebaseAuth } from "../contexts/AuthContext";
import { useAuth as useElectronAuth } from "../contexts/ElectronAuthContext";

const useAuth = window.electronAPI ? useElectronAuth : useFirebaseAuth;


// Theme colors
const sidebarColor = "#FFD7B5";
const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

// Sidebar items
const sidebarItems = [
  { text: "Dashboard", icon: <Home />, active: true },
  { text: "ML Test", icon: <Psychology />, active: false },
  { text: "Settings", icon: <Settings />, active: false }
];

export default function Dashboard() {
  const isElectron = !!window.electronAPI;
  const authData = useAuth() as any;
  const navigate = useNavigate();
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null);

  // For Electron, we use simplified auth
  const currentUser = isElectron ? authData.currentUser : authData.currentUser;
  const logout = isElectron ? authData.signOut : authData.logout;

  // Skip Gmail sync for Electron - it handles email differently
  useEffect(() => {
    if (!isElectron && currentUser && authData.checkGmailConnection) {
      authData.checkGmailConnection();
      
      // Trigger incremental sync if Gmail is connected
      if (authData.isGmailConnected) {
        authData.syncIncremental(currentUser).catch((error: any) => {
          console.error('Dashboard incremental sync failed:', error);
          // Show error in snackbar but don't block UI
          setSnackbar({
            open: true,
            message: 'Failed to sync emails',
            severity: 'error'
          });
        });
      }
    }
  }, [currentUser, isElectron]);


  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileMenuAnchor(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setProfileMenuAnchor(null);
  };

  const handleNavigateToSettings = () => {
    navigate('/settings');
    handleProfileMenuClose();
  };

  const handleSidebarNavigation = (item: { text: string }) => {
    if (item.text === 'Settings') {
      navigate('/settings');
    } else if (item.text === 'Dashboard') {
      // Already on dashboard
    } else if (item.text === 'ML Test') {
      navigate('/ml-test');
    } else {
      // Add other navigation logic here when those pages are implemented
      console.log(`Navigate to ${item.text}`);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    handleProfileMenuClose();
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", background: white }}>
      <CssBaseline />

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: 220,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 220,
            boxSizing: "border-box",
            background: sidebarColor,
            borderRight: 0,
            color: textColor
          }
        }}
      >
        <Toolbar sx={{ my: 2 }}>
          <Box sx={{ ml: 1, display: 'flex', alignItems: 'center' }}>
            <img 
              src={logo} 
              alt="OnlyJobs Logo" 
              style={{ 
                height: '60px', 
                width: 'auto',
                maxWidth: '200px'
              }} 
            />
          </Box>
        </Toolbar>
        <Divider />
        <List>
          {sidebarItems.map((item, idx) => (
            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                selected={item.active} 
                sx={{ borderRadius: 2 }}
                onClick={() => handleSidebarNavigation(item)}
              >
                <ListItemIcon sx={{ color: accent }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      {/* Main Area */}
      <Box sx={{ flexGrow: 1, p: 3 }}>
        {/* Top Bar - User Profile Only */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <IconButton
              onClick={handleProfileMenuOpen}
              sx={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 1,
                color: textColor,
                "&:hover": { bgcolor: "rgba(0,0,0,0.04)" }
              }}
            >
              <Avatar sx={{ bgcolor: accent, width: 36, height: 36 }}>
                {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
              </Avatar>
              <KeyboardArrowDown sx={{ fontSize: 20 }} />
            </IconButton>
            
            <Menu
              anchorEl={profileMenuAnchor}
              open={Boolean(profileMenuAnchor)}
              onClose={handleProfileMenuClose}
              PaperProps={{
                sx: {
                  mt: 1,
                  borderRadius: 2,
                  minWidth: 200,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
                }
              }}
            >
              <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #eee" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: textColor }}>
                  {currentUser?.displayName || "User"}
                </Typography>
                <Typography variant="body2" sx={{ color: "#666" }}>
                  {currentUser?.email}
                </Typography>
              </Box>
              
              <MenuItem onClick={handleNavigateToSettings} sx={{ py: 1.5 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Settings sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText primary="Settings" />
              </MenuItem>
              
              <MenuItem onClick={() => handleProfileMenuClose()} sx={{ py: 1.5 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AccountCircle sx={{ fontSize: 20 }} />
                </ListItemIcon>
                <ListItemText primary="Profile" />
              </MenuItem>
              
              <Divider />
              
              <MenuItem onClick={handleLogout} sx={{ py: 1.5, color: "#d32f2f" }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Logout sx={{ fontSize: 20, color: "#d32f2f" }} />
                </ListItemIcon>
                <ListItemText primary="Logout" />
              </MenuItem>
            </Menu>
          </Box>
        </Box>

        {/* Main Content */}
        {isElectron ? (
          <Box sx={{ p: 3 }}>
            {/* Multi-account Gmail management */}
            <GmailMultiAccount />
            
            {/* Jobs List */}
            <Box sx={{ mt: 3 }}>
              <JobsList />
            </Box>
          </Box>
        ) : (
          /* Looker Studio Dashboard for web */
          <Box sx={{ height: 'calc(105vh - 160px)', width: '100%', overflow: 'hidden' }}>
            <LookerDashboard height="100%" />
          </Box>
        )}
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
  );
} 