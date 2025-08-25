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
  Psychology,
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
  { text: 'AI Prompt', icon: <Psychology />, path: '/prompt-editor', active: false },
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
        {sidebarItems.map((item, index) => (
          <ListItem 
            key={item.text} 
            disablePadding 
            sx={{ 
              mb: 1,
              opacity: 0,
              animation: 'slideInLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              animationDelay: `${index * 100 + 200}ms`,
            }}
            className="list-item-enter"
          >
            <ListItemButton
              selected={isActive(item.path)}
              className="interactive-hover gpu-accelerated"
              sx={{
                borderRadius: 2,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                position: 'relative',
                overflow: 'hidden',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                  transform: 'translateX(4px)',
                  boxShadow: '0 2px 8px rgba(255, 112, 67, 0.3)',
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.contrastText,
                    transform: 'scale(1.1)',
                  },
                  '&::before': {
                    opacity: 1,
                    transform: 'scaleX(1)',
                  },
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark,
                    transform: 'translateX(6px)',
                    boxShadow: '0 4px 12px rgba(255, 112, 67, 0.4)',
                  },
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  backgroundColor: theme.palette.primary.main,
                  borderRadius: '0 2px 2px 0',
                  opacity: 0,
                  transform: 'scaleX(0)',
                  transformOrigin: 'left center',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 112, 67, 0.08)',
                  transform: 'translateX(2px)',
                  '&::before': {
                    opacity: 0.6,
                    transform: 'scaleX(1)',
                  },
                  '& .MuiListItemIcon-root': {
                    transform: 'scale(1.05)',
                    color: theme.palette.primary.main,
                  },
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
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                sx={{
                  '& .MuiTypography-root': {
                    fontWeight: isActive(item.path) ? 600 : 500,
                    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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