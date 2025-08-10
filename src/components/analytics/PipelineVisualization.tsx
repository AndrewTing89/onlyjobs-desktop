import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { PipelineData } from '../../services/analytics.service';

interface PipelineVisualizationProps {
  data: PipelineData[];
  view?: 'funnel' | 'pie' | 'linear';
}

interface PipelineStageProps {
  stage: PipelineData;
  isLast?: boolean;
}

function PipelineStage({ stage, isLast }: PipelineStageProps) {
  const theme = useTheme();

  return (
    <Box sx={{ mb: isLast ? 0 : 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 600,
            color: theme.palette.text.primary,
          }}
        >
          {stage.stage}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`${stage.count}`}
            size="small"
            sx={{
              backgroundColor: `${stage.color}20`,
              color: stage.color,
              fontWeight: 600,
            }}
          />
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              minWidth: 35,
              textAlign: 'right',
            }}
          >
            {stage.percentage}%
          </Typography>
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={stage.percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.palette.grey[200],
          '& .MuiLinearProgress-bar': {
            backgroundColor: stage.color,
            borderRadius: 4,
          },
        }}
      />
    </Box>
  );
}

export default function PipelineVisualization({ data, view = 'linear' }: PipelineVisualizationProps) {
  const theme = useTheme();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            p: 2,
            boxShadow: theme.shadows[4],
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {data.stage}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Count: {data.count}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Percentage: {data.percentage}%
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderPieChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={40}
          dataKey="count"
          startAngle={90}
          endAngle={450}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <LabelList
            dataKey="percentage"
            position="outside"
            formatter={(value: any) => `${value}%`}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              fill: theme.palette.text.primary,
            }}
          />
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );

  const renderFunnelChart = () => {
    const funnelData = data.map((item, index) => ({
      ...item,
      value: item.count,
      name: item.stage,
      fill: item.color,
    }));

    return (
      <ResponsiveContainer width="100%" height={300}>
        <FunnelChart>
          <Funnel
            dataKey="value"
            data={funnelData}
            isAnimationActive
          >
            <LabelList position="center" fill="#fff" stroke="none" />
          </Funnel>
          <Tooltip content={<CustomTooltip />} />
        </FunnelChart>
      </ResponsiveContainer>
    );
  };

  const renderLinearView = () => (
    <Box sx={{ p: 2 }}>
      {data.map((stage, index) => (
        <PipelineStage
          key={stage.stage}
          stage={stage}
          isLast={index === data.length - 1}
        />
      ))}
    </Box>
  );

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 600,
              color: theme.palette.text.primary,
              mb: 1,
            }}
          >
            Application Pipeline
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
            }}
          >
            Current status distribution of your job applications
          </Typography>
        </Box>

        {/* Summary Stats */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
          {data.map((stage) => (
            <Chip
              key={stage.stage}
              label={`${stage.stage}: ${stage.count}`}
              sx={{
                backgroundColor: `${stage.color}15`,
                color: stage.color,
                fontWeight: 600,
                '& .MuiChip-label': {
                  fontSize: '0.75rem',
                },
              }}
            />
          ))}
        </Box>

        {/* Chart Visualization */}
        <Box>
          {view === 'pie' && renderPieChart()}
          {view === 'funnel' && renderFunnelChart()}
          {view === 'linear' && renderLinearView()}
        </Box>
      </CardContent>
    </Card>
  );
}