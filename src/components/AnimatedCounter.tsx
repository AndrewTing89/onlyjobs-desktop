import React, { useState, useEffect, useRef } from 'react';
import { Typography, TypographyProps } from '@mui/material';

interface AnimatedCounterProps extends Omit<TypographyProps, 'children'> {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  onAnimationComplete?: () => void;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1500,
  suffix = '',
  prefix = '',
  decimals = 0,
  onAnimationComplete,
  ...typographyProps
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (value === displayValue) return;

    setIsAnimating(true);
    const startValue = displayValue;
    const endValue = value;
    const startTime = performance.now();

    const animateValue = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth animation (ease-out cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (endValue - startValue) * easeProgress;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animateValue);
      } else {
        setIsAnimating(false);
        onAnimationComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animateValue);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, displayValue, onAnimationComplete]);

  const formatValue = (num: number): string => {
    return num.toFixed(decimals);
  };

  return (
    <Typography
      {...typographyProps}
      className={`${typographyProps.className || ''} ${isAnimating ? 'stat-updated' : ''}`}
      sx={{
        fontFeatureSettings: '"tnum"', // Use tabular numbers for consistent spacing
        transition: 'color 0.3s ease',
        ...typographyProps.sx,
      }}
    >
      {prefix}{formatValue(displayValue)}{suffix}
    </Typography>
  );
};

export default AnimatedCounter;