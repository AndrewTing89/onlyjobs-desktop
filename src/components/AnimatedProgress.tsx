import React, { useEffect, useState } from 'react';
import { Box, LinearProgress, Typography, useTheme } from '@mui/material';
import { styled } from '@mui/material/styles';

interface AnimatedProgressProps {
  value: number;
  maxValue?: number;
  label?: string;
  color?: string;
  height?: number;
  showValue?: boolean;
  animationDuration?: number;
  variant?: 'standard' | 'glow' | 'gradient' | 'stepped';
}

const StyledProgressContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
}));

const GlowProgress = styled(LinearProgress)<{ customColor: string; height: number }>(
  ({ customColor: color, height, theme }) => ({
    height: height,
    borderRadius: height / 2,
    backgroundColor: `${color}20`,
    overflow: 'hidden',
    '& .MuiLinearProgress-bar': {
      backgroundColor: color,
      borderRadius: height / 2,
      boxShadow: `0 0 ${height}px ${color}60`,
      animation: 'progressGlow 2s ease-in-out infinite alternate',
      transition: 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    },
    '@keyframes progressGlow': {
      '0%': { boxShadow: `0 0 ${height}px ${color}60` },
      '100%': { boxShadow: `0 0 ${height * 2}px ${color}80` },
    },
  })
);

const GradientProgress = styled(LinearProgress)<{ customColor: string; height: number }>(
  ({ customColor: color, height, theme }) => ({
    height: height,
    borderRadius: height / 2,
    backgroundColor: `${color}15`,
    '& .MuiLinearProgress-bar': {
      borderRadius: height / 2,
      background: `linear-gradient(90deg, ${color}80, ${color}, ${color}80)`,
      backgroundSize: '200% 100%',
      animation: 'gradientShift 3s ease-in-out infinite',
      transition: 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    },
    '@keyframes gradientShift': {
      '0%, 100%': { backgroundPosition: '200% 0' },
      '50%': { backgroundPosition: '0% 0' },
    },
  })
);

const SteppedProgress = styled(LinearProgress)<{ customColor: string; height: number }>(
  ({ customColor: color, height, theme }) => ({
    height: height,
    borderRadius: 2,
    backgroundColor: `${color}20`,
    '& .MuiLinearProgress-bar': {
      backgroundColor: color,
      borderRadius: 2,
      position: 'relative',
      transition: 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      '&::after': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent 8px,
          ${color}40 8px,
          ${color}40 10px
        )`,
      },
    },
  })
);

export const AnimatedProgress: React.FC<AnimatedProgressProps> = ({
  value,
  maxValue = 100,
  label,
  color,
  height = 8,
  showValue = false,
  animationDuration = 1500,
  variant = 'standard',
}) => {
  const theme = useTheme();
  const [displayValue, setDisplayValue] = useState(0);
  const progressColor = color || theme.palette.primary.main;
  const normalizedValue = Math.min((value / maxValue) * 100, 100);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayValue(normalizedValue);
    }, 100);

    return () => clearTimeout(timer);
  }, [normalizedValue]);

  const renderProgress = () => {
    const commonProps = {
      variant: 'determinate' as const,
      value: displayValue,
      className: 'gpu-accelerated',
    };

    switch (variant) {
      case 'glow':
        return <GlowProgress {...commonProps} customColor={progressColor} height={height} />;
      case 'gradient':
        return <GradientProgress {...commonProps} customColor={progressColor} height={height} />;
      case 'stepped':
        return <SteppedProgress {...commonProps} customColor={progressColor} height={height} />;
      default:
        return (
          <LinearProgress
            {...commonProps}
            sx={{
              height: height,
              borderRadius: height / 2,
              backgroundColor: `${progressColor}20`,
              '& .MuiLinearProgress-bar': {
                backgroundColor: progressColor,
                borderRadius: height / 2,
                transition: `transform ${animationDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
              },
            }}
          />
        );
    }
  };

  return (
    <StyledProgressContainer>
      {label && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: theme.palette.text.primary,
            }}
          >
            {label}
          </Typography>
          {showValue && (
            <Typography
              variant="body2"
              sx={{
                color: progressColor,
                fontWeight: 600,
                minWidth: 35,
                textAlign: 'right',
              }}
            >
              {Math.round(normalizedValue)}%
            </Typography>
          )}
        </Box>
      )}
      {renderProgress()}
    </StyledProgressContainer>
  );
};

export default AnimatedProgress;