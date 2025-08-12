import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { TimeSeriesData } from '../../services/analytics.service';

interface ApplicationTrendsProps {
  data: TimeSeriesData[];
  chartType?: 'line' | 'bar';
}

export default function ApplicationTrends({ data, chartType = 'line' }: ApplicationTrendsProps) {
  const theme = useTheme();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
            {formatDate(label)}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography
              key={index}
              variant="body2"
              sx={{
                color: entry.color,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: entry.color,
                }}
              />
              {entry.name}: {entry.value}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  const chartColors = {
    applications: theme.palette.primary.main,
    interviews: theme.palette.warning.main,
    offers: theme.palette.success.main,
    rejections: theme.palette.error.main,
  };

  return (
    <Card 
      className="chart-container animate-card gpu-accelerated"
      sx={{ 
        height: '100%',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[8],
        },
      }}
    >
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
            Application Trends
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
            }}
          >
            Daily application activity over the last 30 days
          </Typography>
        </Box>

        <Box 
          sx={{ height: 300 }}
          className="chart-loading"
        >
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke={theme.palette.text.secondary}
                  fontSize={12}
                />
                <YAxis
                  stroke={theme.palette.text.secondary}
                  fontSize={12}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="applications"
                  name="Applications"
                  stroke={chartColors.applications}
                  strokeWidth={3}
                  dot={{ fill: chartColors.applications, r: 4 }}
                  activeDot={{ r: 8, stroke: chartColors.applications, strokeWidth: 2, fill: theme.palette.background.paper }}
                  animationDuration={1500}
                  animationBegin={0}
                />
                <Line
                  type="monotone"
                  dataKey="interviews"
                  name="Interviews"
                  stroke={chartColors.interviews}
                  strokeWidth={2}
                  dot={{ fill: chartColors.interviews, r: 3 }}
                  activeDot={{ r: 6, stroke: chartColors.interviews, strokeWidth: 2, fill: theme.palette.background.paper }}
                  animationDuration={1500}
                  animationBegin={200}
                />
                <Line
                  type="monotone"
                  dataKey="offers"
                  name="Offers"
                  stroke={chartColors.offers}
                  strokeWidth={2}
                  dot={{ fill: chartColors.offers, r: 3 }}
                  activeDot={{ r: 6, stroke: chartColors.offers, strokeWidth: 2, fill: theme.palette.background.paper }}
                  animationDuration={1500}
                  animationBegin={400}
                />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke={theme.palette.text.secondary}
                  fontSize={12}
                />
                <YAxis
                  stroke={theme.palette.text.secondary}
                  fontSize={12}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar
                  dataKey="applications"
                  name="Applications"
                  fill={chartColors.applications}
                  radius={[2, 2, 0, 0]}
                  animationDuration={1200}
                  animationBegin={0}
                />
                <Bar
                  dataKey="interviews"
                  name="Interviews"
                  fill={chartColors.interviews}
                  radius={[2, 2, 0, 0]}
                  animationDuration={1200}
                  animationBegin={200}
                />
                <Bar
                  dataKey="offers"
                  name="Offers"
                  fill={chartColors.offers}
                  radius={[2, 2, 0, 0]}
                  animationDuration={1200}
                  animationBegin={400}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
}