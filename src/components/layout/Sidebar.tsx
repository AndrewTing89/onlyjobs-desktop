import React from 'react';
import {
  Box,
  Drawer,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Home,
  Settings,
  Analytics,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import logo from '../../company-logo.jpeg';

export interface SidebarItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  active?: boolean;
}

interface SidebarProps {
  currentPath?: string;
}

const sidebarItems: SidebarItem[] = [
  { text: 'Dashboard', icon: <Home />, path: '/', active: true },
  { text: 'Analytics', icon: <Analytics />, path: '/analytics', active: false },
  { text: 'Settings', icon: <Settings />, path: '/settings', active: false },
];

const SIDEBAR_WIDTH = 240;

export default function Sidebar({ currentPath = '/' }: SidebarProps) {
  const navigate = useNavigate();
  const theme = useTheme();

  const handleNavigation = (item: SidebarItem) => {
    navigate(item.path);
  };

  const isActive = (itemPath: string) => {
    if (itemPath === '/' && currentPath === '/') return true;
    if (itemPath !== '/' && currentPath.startsWith(itemPath)) return true;
    return false;
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          background: theme.palette.primary.light,
          borderRight: 0,
          color: theme.palette.text.primary,
        },
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
              maxWidth: '200px',
            }}
          />
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ px: 2 }}>
        {sidebarItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
            <ListItemButton
              selected={isActive(item.path)}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.contrastText,
                  },
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark,
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 112, 67, 0.08)',
                },
              }}
              onClick={() => handleNavigation(item)}
            >
              <ListItemIcon
                sx={{
                  color: isActive(item.path)
                    ? theme.palette.primary.contrastText
                    : theme.palette.primary.main,
                  minWidth: 40,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                sx={{
                  '& .MuiTypography-root': {
                    fontWeight: isActive(item.path) ? 600 : 500,
                  }
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}