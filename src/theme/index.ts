/**
 * OnlyJobs Design System - Centralized Theme
 * Standardizes all colors, typography, and spacing across the application
 */

import { createTheme, Theme } from '@mui/material/styles';

// Brand Colors (based on existing usage)
export const brandColors = {
  accent: '#FF7043',      // Primary orange accent  
  accentLight: '#FFD7B5', // Light orange (sidebar)
  white: '#fff',
  textPrimary: '#202020',
  textSecondary: '#616161',
  background: '#FAFAFA',
  paper: '#FFFFFF',
  divider: '#E0E0E0',
  
  // Job Status Colors (from existing JobsList component)
  status: {
    Applied: '#2196F3',    // Blue
    Interviewed: '#FF9800', // Amber  
    Offer: '#9C27B0',      // Purple
    Declined: '#F44336',   // Red
    Pending: '#9E9E9E',    // Grey
  },
  
  // Neutral Palette
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5', 
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  }
} as const;

// Material-UI Theme Configuration
export const onlyJobsTheme: Theme = createTheme({
  palette: {
    primary: {
      main: brandColors.accent,
      light: brandColors.accentLight,
      dark: '#E64A19',
      contrastText: brandColors.white,
    },
    secondary: {
      main: '#2196F3',
      light: '#BBDEFB', 
      dark: '#1976D2',
      contrastText: brandColors.white,
    },
    background: {
      default: brandColors.background,
      paper: brandColors.paper,
    },
    text: {
      primary: brandColors.textPrimary,
      secondary: brandColors.textSecondary,
    },
    divider: brandColors.divider,
    success: {
      main: '#4CAF50',
      light: '#C8E6C9',
      dark: '#388E3C',
    },
    warning: {
      main: '#FF9800',
      light: '#FFE0B2', 
      dark: '#F57C00',
    },
    error: {
      main: '#F44336',
      light: '#FFCDD2',
      dark: '#D32F2F', 
    },
    info: {
      main: '#2196F3',
      light: '#E3F2FD',
      dark: '#1976D2',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.5rem', 
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.125rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.75rem',
      fontWeight: 400, 
      lineHeight: 1.4,
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.3,
      color: brandColors.textSecondary,
    }
  },
  spacing: 8, // 8px grid system
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', 
          }
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: brandColors.paper,
          color: brandColors.textPrimary,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        },
      },
    }
  }
});

// Helper function to get status colors
export const getStatusColor = (status: string): string => {
  return brandColors.status[status as keyof typeof brandColors.status] || brandColors.neutral[500];
};

// Export individual color tokens for direct usage
export { brandColors as colors };
export type StatusType = keyof typeof brandColors.status;