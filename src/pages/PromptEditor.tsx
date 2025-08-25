import React from 'react';
import {
  Box,
  CssBaseline,
  Typography,
  Paper,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Psychology,
  School,
  Code,
  Science,
  AutoAwesome,
  TipsAndUpdates
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { onlyJobsTheme } from '../theme';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { MistralPromptEditor } from '../components/MistralPromptEditor';
import { useAuth } from '../contexts/ElectronAuthContext';

export default function PromptEditor() {
  const location = useLocation();
  const { currentUser, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      // Navigation will be handled by auth context
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <ThemeProvider theme={onlyJobsTheme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
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
              title="AI Prompt Editor"
            />
          </Box>

          {/* Main Content */}
          <Box sx={{ flexGrow: 1, p: 3, pt: 1, overflow: 'auto' }}>
            {/* Quick Start Guide */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3, backgroundColor: 'background.paper' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TipsAndUpdates sx={{ color: 'primary.main' }} />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Quick Start Guide
                </Typography>
              </Box>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Customize how the AI classifies your job-related emails using Mistral-7B's instruction-following capabilities.
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <School sx={{ fontSize: 20, color: 'primary.main' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="1. System Instruction"
                      secondary="Define the main task - what the AI should do with emails"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Code sx={{ fontSize: 20, color: 'success.main' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="2. Add Examples"
                      secondary="Provide sample emails and their correct classifications"
                    />
                  </ListItem>
                </List>
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <Science sx={{ fontSize: 20, color: 'info.main' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="3. Define Rules"
                      secondary="Set priorities and extraction logic for companies/positions"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <AutoAwesome sx={{ fontSize: 20, color: 'warning.main' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="4. Test & Save"
                      secondary="Test with real emails, then save when satisfied"
                    />
                  </ListItem>
                </List>
              </Box>
            </Paper>

            {/* How It Works Alert */}
            <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                How It Works
              </Typography>
              <Typography variant="body2">
                The AI uses <strong>few-shot learning</strong> - it learns from the examples you provide. 
                Add diverse examples (applications, interviews, rejections, offers) to improve accuracy. 
                The more specific your examples and rules, the better the classification.
              </Typography>
            </Alert>

            {/* Prompt Editor Component */}
            <MistralPromptEditor />

            {/* Tips Section */}
            <Paper sx={{ p: 3, mt: 3, borderRadius: 3, backgroundColor: 'grey.50' }}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Psychology /> Pro Tips
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    For Better Company Detection:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    • Include examples from ATS systems (Workday, Greenhouse)<br/>
                    • Show how to extract company from "at [Company]" patterns<br/>
                    • Add rules for cleaning company names (remove Inc., Ltd.)
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    For Better Status Detection:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    • Define clear priority: Declined {'>'} Offer {'>'} Interview {'>'} Applied<br/>
                    • Include key phrases for each status in your rules<br/>
                    • Test with edge cases like mixed signals
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}