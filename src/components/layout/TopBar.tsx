import React, { useState } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Settings,
  AccountCircle,
  Logout,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';

interface TopBarProps {
  currentUser?: {
    displayName?: string;
    email?: string;
  };
  onLogout: () => Promise<void>;
  title?: string;
}

export default function TopBar({ currentUser, onLogout, title }: TopBarProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null);
  const isElectron = !!window.electronAPI;

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

  const handleLogout = async () => {
    try {
      await onLogout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    handleProfileMenuClose();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 3,
        px: 1,
      }}
    >
      {/* Page Title */}
      {title && (
        <Typography
          variant="h1"
          sx={{
            color: theme.palette.text.primary,
            fontWeight: 700,
          }}
        >
          {title}
        </Typography>
      )}

      {/* User Profile Section - Hidden in Electron */}
      {!isElectron && (
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
        <IconButton
          onClick={handleProfileMenuOpen}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: theme.palette.text.primary,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
            borderRadius: 2,
            px: 1.5,
            py: 1,
          }}
        >
          <Avatar
            sx={{
              bgcolor: theme.palette.primary.main,
              width: 36,
              height: 36,
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {currentUser?.displayName?.charAt(0) || 
             currentUser?.email?.charAt(0) || 
             'U'}
          </Avatar>
          <Box sx={{ textAlign: 'left', display: { xs: 'none', md: 'block' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {currentUser?.displayName || 'User'}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {currentUser?.email}
            </Typography>
          </Box>
          <KeyboardArrowDown sx={{ fontSize: 20 }} />
        </IconButton>

        <Menu
          anchorEl={profileMenuAnchor}
          open={Boolean(profileMenuAnchor)}
          onClose={handleProfileMenuClose}
          PaperProps={{
            sx: {
              mt: 1,
              borderRadius: 3,
              minWidth: 240,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              border: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          {/* User Info Header */}
          <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography
              variant="subtitle2"
              sx={{ 
                fontWeight: 600, 
                color: theme.palette.text.primary,
                mb: 0.5,
              }}
            >
              {currentUser?.displayName || 'User'}
            </Typography>
            <Typography
              variant="body2"
              sx={{ 
                color: theme.palette.text.secondary,
                wordBreak: 'break-word',
              }}
            >
              {currentUser?.email}
            </Typography>
          </Box>

          {/* Menu Items */}
          <MenuItem
            onClick={handleNavigateToSettings}
            sx={{
              py: 1.5,
              mx: 1,
              my: 0.5,
              borderRadius: 2,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Settings sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              sx={{ '& .MuiTypography-root': { fontWeight: 500 } }}
            />
          </MenuItem>

          <MenuItem
            onClick={handleProfileMenuClose}
            sx={{
              py: 1.5,
              mx: 1,
              my: 0.5,
              borderRadius: 2,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <AccountCircle sx={{ fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary="Profile"
              sx={{ '& .MuiTypography-root': { fontWeight: 500 } }}
            />
          </MenuItem>

          <Divider sx={{ my: 1 }} />

          <MenuItem
            onClick={handleLogout}
            sx={{
              py: 1.5,
              mx: 1,
              mb: 1,
              borderRadius: 2,
              color: theme.palette.error.main,
              '&:hover': {
                backgroundColor: theme.palette.error.light,
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Logout sx={{ fontSize: 20, color: theme.palette.error.main }} />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              sx={{
                '& .MuiTypography-root': { 
                  fontWeight: 500,
                  color: theme.palette.error.main,
                },
              }}
            />
          </MenuItem>
        </Menu>
        </Box>
      )}
    </Box>
  );
}