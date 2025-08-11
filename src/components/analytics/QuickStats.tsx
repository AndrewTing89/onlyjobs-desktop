import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  WorkOutline,
  QuestionAnswer,
  BusinessCenter,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { JobStats } from '../../services/analytics.service';
import AnimatedCounter from '../AnimatedCounter';

interface QuickStatsProps {
  stats: JobStats;
  weeklyTrend: { change: number; isIncrease: boolean };
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactElement;
  color: string;
  subtitle?: string;
  trend?: { change: number; isIncrease: boolean };
}

function StatCard({ title, value, icon, color, subtitle, trend }: StatCardProps) {
  const theme = useTheme();

  return (
    <Card
      className="animate-card gpu-accelerated"
      sx={{
        height: '100%',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[12],
          '&::before': {
            opacity: 1,
          },
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}80)`,
          opacity: 0,
          transition: 'opacity 0.3s ease',
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 3,
              backgroundColor: `${color}15`,
              color: color,
            }}
          >
            {icon}
          </Box>
          {trend && (
            <Chip
              size="small"
              icon={trend.isIncrease ? <TrendingUp /> : <TrendingDown />}
              label={`${trend.change}%`}
              sx={{
                backgroundColor: trend.isIncrease 
                  ? theme.palette.success.light 
                  : theme.palette.error.light,
                color: trend.isIncrease 
                  ? theme.palette.success.dark 
                  : theme.palette.error.dark,
                '& .MuiChip-icon': {
                  color: 'inherit',
                },
              }}
            />
          )}
        </Box>

        {typeof value === 'number' ? (
          <AnimatedCounter
            value={value}
            variant="h2"
            sx={{
              fontWeight: 700,
              color: theme.palette.text.primary,
              mb: 0.5,
              lineHeight: 1.2,
            }}
            duration={1200}
          />
        ) : (
          <AnimatedCounter
            value={parseFloat(value.replace('%', '')) || 0}
            variant="h2"
            suffix="%"
            sx={{
              fontWeight: 700,
              color: theme.palette.text.primary,
              mb: 0.5,
              lineHeight: 1.2,
            }}
            duration={1200}
          />
        )}

        <Typography
          variant="body1"
          sx={{
            color: theme.palette.text.primary,
            fontWeight: 600,
            mb: subtitle ? 0.5 : 0,
          }}
        >
          {title}
        </Typography>

        {subtitle && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function QuickStats({ stats, weeklyTrend }: QuickStatsProps) {
  const theme = useTheme();

  const statCards = [
    {
      title: 'Total Applications',
      value: stats.totalApplications,
      icon: <WorkOutline />,
      color: theme.palette.primary.main,
      subtitle: 'All time applications',
      trend: weeklyTrend,
    },
    {
      title: 'Response Rate',
      value: `${stats.responseRate}%`,
      icon: <QuestionAnswer />,
      color: theme.palette.info.main,
      subtitle: 'Companies that responded',
    },
    {
      title: 'Interview Rate',
      value: `${stats.interviewRate}%`,
      icon: <BusinessCenter />,
      color: theme.palette.warning.main,
      subtitle: 'Applications to interviews',
    },
    {
      title: 'Offer Rate',
      value: `${stats.offerRate}%`,
      icon: <BusinessCenter />,
      color: theme.palette.success.main,
      subtitle: 'Interviews to offers',
    },
  ];

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {statCards.map((card, index) => (
        <Grid 
          size={{ xs: 12, sm: 6, md: 3 }} 
          key={index}
          className="stat-card-enter"
          sx={{
            animationDelay: `${index * 100}ms`,
          }}
        >
          <StatCard {...card} />
        </Grid>
      ))}
    </Grid>
  );
}