import React from 'react';
import {
  Box,
  Chip,
  Tooltip,
  LinearProgress,
  Typography
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error
} from '@mui/icons-material';
import { getConfidenceLevel, type ConfidenceLevel } from '../types/classification';

interface ConfidenceIndicatorProps {
  confidence: number;
  variant?: 'chip' | 'progress' | 'detailed';
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  showPercentage?: boolean;
}

const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  confidence,
  variant = 'chip',
  size = 'medium',
  showIcon = true,
  showPercentage = false
}) => {
  const level = getConfidenceLevel(confidence);
  
  const getIcon = (level: ConfidenceLevel) => {
    switch (level.level) {
      case 'high':
        return <CheckCircle sx={{ fontSize: size === 'small' ? 16 : size === 'medium' ? 20 : 24 }} />;
      case 'medium':
        return <Warning sx={{ fontSize: size === 'small' ? 16 : size === 'medium' ? 20 : 24 }} />;
      case 'low':
        return <Error sx={{ fontSize: size === 'small' ? 16 : size === 'medium' ? 20 : 24 }} />;
    }
  };

  const tooltipContent = (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {level.label}: {confidence}%
      </Typography>
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {level.level === 'high' && 'High confidence - likely accurate'}
        {level.level === 'medium' && 'Medium confidence - may need review'}
        {level.level === 'low' && 'Low confidence - requires review'}
      </Typography>
    </Box>
  );

  if (variant === 'chip') {
    return (
      <Tooltip title={tooltipContent} arrow placement="top">
        <Chip
          icon={showIcon ? getIcon(level) : undefined}
          label={
            showPercentage 
              ? `${confidence}%` 
              : level.label
          }
          size={size === 'large' ? 'medium' : size}
          sx={{
            backgroundColor: level.backgroundColor,
            color: level.color,
            border: `1px solid ${level.borderColor}`,
            fontWeight: 500,
            transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: `0 2px 8px ${level.color}30`,
            },
            '& .MuiChip-icon': {
              color: level.color,
            }
          }}
        />
      </Tooltip>
    );
  }

  if (variant === 'progress') {
    return (
      <Tooltip title={tooltipContent} arrow placement="top">
        <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
          {showIcon && (
            <Box sx={{ color: level.color }}>
              {getIcon(level)}
            </Box>
          )}
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress
              variant="determinate"
              value={confidence}
              sx={{
                height: size === 'small' ? 6 : size === 'medium' ? 8 : 10,
                borderRadius: 4,
                backgroundColor: `${level.color}20`,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: level.color,
                  borderRadius: 4,
                },
              }}
            />
          </Box>
          {showPercentage && (
            <Typography 
              variant={size === 'small' ? 'caption' : 'body2'} 
              sx={{ 
                color: level.color, 
                fontWeight: 500,
                minWidth: '35px',
                textAlign: 'right'
              }}
            >
              {confidence}%
            </Typography>
          )}
        </Box>
      </Tooltip>
    );
  }

  if (variant === 'detailed') {
    return (
      <Box
        sx={{
          p: size === 'small' ? 1 : size === 'medium' ? 1.5 : 2,
          borderRadius: 2,
          backgroundColor: level.backgroundColor,
          border: `1px solid ${level.borderColor}`,
          transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color: level.color }}>
            {getIcon(level)}
          </Box>
          <Typography 
            variant={size === 'small' ? 'body2' : 'body1'} 
            sx={{ fontWeight: 500, color: level.color }}
          >
            {level.label}
          </Typography>
          <Typography 
            variant={size === 'small' ? 'caption' : 'body2'} 
            sx={{ color: level.color, ml: 'auto', fontWeight: 600 }}
          >
            {confidence}%
          </Typography>
        </Box>
        
        <LinearProgress
          variant="determinate"
          value={confidence}
          sx={{
            height: size === 'small' ? 4 : size === 'medium' ? 6 : 8,
            borderRadius: 2,
            backgroundColor: `${level.color}15`,
            '& .MuiLinearProgress-bar': {
              backgroundColor: level.color,
              borderRadius: 2,
            },
          }}
        />
        
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'text.secondary', 
            mt: 0.5,
            display: 'block'
          }}
        >
          {level.level === 'high' && 'Classification is likely accurate'}
          {level.level === 'medium' && 'May require human verification'}
          {level.level === 'low' && 'Requires manual review'}
        </Typography>
      </Box>
    );
  }

  return null;
};

export default ConfidenceIndicator;