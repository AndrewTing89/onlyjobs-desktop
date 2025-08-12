// LoadingSpinner.tsx
import React from 'react';
import { Box, styled } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  fullScreen?: boolean;
  variant?: 'circle' | 'dots' | 'pulse' | 'bars' | 'skeleton' | 'professional';
}

// Styled components for different spinner variants
const SpinnerContainer = styled(Box)<{ size: number }>(({ size }) => ({
  width: size,
  height: size,
  display: 'inline-block',
}));

const CircleSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  width: size,
  height: size,
  border: `3px solid ${color}20`,
  borderTopColor: color,
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  '@keyframes spin': {
    to: { transform: 'rotate(360deg)' },
  },
}));

const DotsSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: size,
  height: size / 4,
  '& > div': {
    width: size / 6,
    height: size / 6,
    backgroundColor: color,
    borderRadius: '50%',
    animation: 'bounce 1.4s ease-in-out infinite both',
    '&:nth-of-type(1)': { animationDelay: '-0.32s' },
    '&:nth-of-type(2)': { animationDelay: '-0.16s' },
    '&:nth-of-type(3)': { animationDelay: '0' },
  },
  '@keyframes bounce': {
    '0%, 80%, 100%': {
      transform: 'scale(0)',
    },
    '40%': {
      transform: 'scale(1)',
    },
  },
}));

const PulseSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  width: size,
  height: size,
  backgroundColor: color,
  borderRadius: '50%',
  animation: 'pulse 1.5s ease-in-out infinite',
  '@keyframes pulse': {
    '0%': {
      transform: 'scale(0)',
      opacity: 1,
    },
    '100%': {
      transform: 'scale(1)',
      opacity: 0,
    },
  },
}));

const BarsSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: size,
  height: size,
  '& > div': {
    width: size / 8,
    height: size,
    backgroundColor: color,
    borderRadius: size / 16,
    animation: 'bars 1.2s infinite ease-in-out',
    '&:nth-of-type(2)': { animationDelay: '-1.1s' },
    '&:nth-of-type(3)': { animationDelay: '-1.0s' },
    '&:nth-of-type(4)': { animationDelay: '-0.9s' },
  },
  '@keyframes bars': {
    '0%, 40%, 100%': {
      transform: 'scaleY(0.4)',
    },
    '20%': {
      transform: 'scaleY(1)',
    },
  },
}));

const SkeletonSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  width: size * 3,
  height: size / 3,
  borderRadius: size / 6,
  background: `linear-gradient(90deg, ${color}20 25%, ${color}40 50%, ${color}20 75%)`,
  backgroundSize: '200% 100%',
  animation: 'skeletonShimmer 1.5s infinite ease-in-out',
  '@keyframes skeletonShimmer': {
    '0%': { backgroundPosition: '-200px 0' },
    '100%': { backgroundPosition: 'calc(200px + 100%) 0' },
  },
}));

const ProfessionalSpinner = styled('div')<{ size: number; color: string }>(({ size, color }) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: `conic-gradient(from 0deg, ${color}00, ${color}, ${color}00)`,
  mask: `radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))`,
  animation: 'professionalSpin 1s linear infinite',
  '@keyframes professionalSpin': {
    to: { transform: 'rotate(360deg)' },
  },
}));

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color,
  fullScreen = false,
  variant = 'circle'
}) => {
  const theme = useTheme();
  const spinnerColor = color || theme.palette.primary.main;
  
  const sizeMap = {
    small: 20,
    medium: 40,
    large: 60
  };

  const spinnerSize = sizeMap[size];

  const renderSpinner = () => {
    switch (variant) {
      case 'dots':
        return (
          <DotsSpinner size={spinnerSize} color={spinnerColor}>
            <div />
            <div />
            <div />
          </DotsSpinner>
        );
      case 'pulse':
        return <PulseSpinner size={spinnerSize} color={spinnerColor} />;
      case 'bars':
        return (
          <BarsSpinner size={spinnerSize} color={spinnerColor}>
            <div />
            <div />
            <div />
            <div />
          </BarsSpinner>
        );
      case 'skeleton':
        return <SkeletonSpinner size={spinnerSize} color={spinnerColor} />;
      case 'professional':
        return <ProfessionalSpinner size={spinnerSize} color={spinnerColor} />;
      default:
        return <CircleSpinner size={spinnerSize} color={spinnerColor} />;
    }
  };

  const spinner = (
    <SpinnerContainer size={spinnerSize}>
      {renderSpinner()}
    </SpinnerContainer>
  );

  if (fullScreen) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(2px)',
          zIndex: 9999,
        }}
      >
        {spinner}
      </Box>
    );
  }

  return spinner;
};