import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  TextField,
  Typography,
  Popover,
  Paper,
  Divider,
} from '@mui/material';
import {
  DateRange as DateRangeIcon,
  CalendarToday,
  Clear,
  Today,
} from '@mui/icons-material';
import { DateRangeFilterProps, DatePreset } from '../../types/filter.types';

const accent = "#FF7043";

// Generate date presets
const generateDatePresets = (): DatePreset[] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return [
    {
      label: 'Today',
      value: 'today',
      startDate: today,
      endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
    },
    {
      label: 'Last 7 days',
      value: 'last-7-days',
      startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: now,
    },
    {
      label: 'Last 30 days',
      value: 'last-30-days',
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: now,
    },
    {
      label: 'Last 3 months',
      value: 'last-3-months',
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
      endDate: now,
    },
    {
      label: 'Last 6 months',
      value: 'last-6-months',
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
      endDate: now,
    },
    {
      label: 'This year',
      value: 'this-year',
      startDate: new Date(now.getFullYear(), 0, 1),
      endDate: now,
    },
  ];
};

export default function DateRangeFilter({
  dateRange,
  selectedPreset,
  presets = generateDatePresets(),
  onDateRangeChange,
  onPresetChange,
}: DateRangeFilterProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [tempStartDate, setTempStartDate] = useState(
    dateRange.startDate ? dateRange.startDate.toISOString().split('T')[0] : ''
  );
  const [tempEndDate, setTempEndDate] = useState(
    dateRange.endDate ? dateRange.endDate.toISOString().split('T')[0] : ''
  );

  const handlePresetSelect = (preset: DatePreset) => {
    onDateRangeChange({
      startDate: preset.startDate,
      endDate: preset.endDate,
    });
    onPresetChange(preset.value);
  };

  const handleCustomDateOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setTempStartDate(dateRange.startDate ? dateRange.startDate.toISOString().split('T')[0] : '');
    setTempEndDate(dateRange.endDate ? dateRange.endDate.toISOString().split('T')[0] : '');
  };

  const handleCustomDateClose = () => {
    setAnchorEl(null);
  };

  const handleCustomDateApply = () => {
    const startDate = tempStartDate ? new Date(tempStartDate) : null;
    const endDate = tempEndDate ? new Date(tempEndDate) : null;
    
    onDateRangeChange({ startDate, endDate });
    onPresetChange(null);
    setAnchorEl(null);
  };

  const handleClearDates = () => {
    onDateRangeChange({ startDate: null, endDate: null });
    onPresetChange(null);
  };

  const formatDateRange = () => {
    if (!dateRange.startDate && !dateRange.endDate) return null;
    
    const formatDate = (date: Date) => 
      date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });

    if (dateRange.startDate && dateRange.endDate) {
      return `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    } else if (dateRange.startDate) {
      return `From ${formatDate(dateRange.startDate)}`;
    } else if (dateRange.endDate) {
      return `Until ${formatDate(dateRange.endDate)}`;
    }
    return null;
  };

  const hasDateFilter = dateRange.startDate || dateRange.endDate;
  const isCustomRange = hasDateFilter && !selectedPreset;

  return (
    <Box>
      {/* Date Presets */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {presets.map((preset) => (
            <Chip
              key={preset.value}
              label={preset.label}
              size="small"
              variant={selectedPreset === preset.value ? "filled" : "outlined"}
              clickable
              onClick={() => handlePresetSelect(preset)}
              sx={{
                backgroundColor: selectedPreset === preset.value ? accent : 'transparent',
                color: selectedPreset === preset.value ? 'white' : 'text.primary',
                borderColor: selectedPreset === preset.value ? accent : 'divider',
                fontWeight: 500,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                '&:hover': {
                  backgroundColor: selectedPreset === preset.value ? `${accent}DD` : `${accent}15`,
                  borderColor: accent,
                  transform: 'scale(1.02)',
                },
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Custom Date Range and Current Selection */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant={isCustomRange ? "contained" : "outlined"}
          size="small"
          startIcon={<CalendarToday />}
          onClick={handleCustomDateOpen}
          sx={{
            backgroundColor: isCustomRange ? accent : 'transparent',
            borderColor: accent,
            color: isCustomRange ? 'white' : accent,
            '&:hover': {
              backgroundColor: isCustomRange ? `${accent}DD` : `${accent}15`,
            },
          }}
        >
          Custom Range
        </Button>

        {hasDateFilter && (
          <>
            <Chip
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <DateRangeIcon sx={{ fontSize: 14 }} />
                  <Typography variant="caption">
                    {formatDateRange()}
                  </Typography>
                </Box>
              }
              size="small"
              variant="filled"
              onDelete={handleClearDates}
              deleteIcon={<Clear sx={{ fontSize: 16 }} />}
              sx={{
                backgroundColor: `${accent}15`,
                color: accent,
                '& .MuiChip-deleteIcon': {
                  color: accent,
                  '&:hover': {
                    color: `${accent}DD`,
                  },
                },
              }}
            />
          </>
        )}
      </Box>

      {/* Custom Date Range Popover */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleCustomDateClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        sx={{
          '& .MuiPopover-paper': {
            mt: 1,
            boxShadow: (theme) => theme.shadows[8],
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Paper sx={{ p: 3, minWidth: 300 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Custom Date Range
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={6}>
              <TextField
                label="Start Date"
                type="date"
                size="small"
                fullWidth
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '&.Mui-focused': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: accent,
                      },
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: accent,
                  },
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="End Date"
                type="date"
                size="small"
                fullWidth
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '&.Mui-focused': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: accent,
                      },
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: accent,
                  },
                }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={handleCustomDateClose}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleCustomDateApply}
              sx={{
                backgroundColor: accent,
                '&:hover': {
                  backgroundColor: `${accent}DD`,
                },
              }}
            >
              Apply
            </Button>
          </Box>
        </Paper>
      </Popover>
    </Box>
  );
}