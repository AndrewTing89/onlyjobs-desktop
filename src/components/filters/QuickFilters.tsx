import React from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  Schedule,
  TrendingUp,
  Star,
  FilterList,
  AccessTime,
  Business,
} from '@mui/icons-material';
import { QuickFiltersProps } from '../../types/filter.types';

const accent = "#FF7043";

const quickFilterIcons: Record<string, React.ReactElement> = {
  recent: <AccessTime sx={{ fontSize: 16 }} />,
  'awaiting-response': <Schedule sx={{ fontSize: 16 }} />,
  'in-progress': <TrendingUp sx={{ fontSize: 16 }} />,
  offers: <Star sx={{ fontSize: 16 }} />,
  companies: <Business sx={{ fontSize: 16 }} />,
  default: <FilterList sx={{ fontSize: 16 }} />,
};

interface QuickFiltersExtendedProps extends QuickFiltersProps {
  compact?: boolean;
}

export default function QuickFilters({
  quickFilters,
  currentFilter,
  onQuickFilterApply,
  compact = false,
}: QuickFiltersExtendedProps) {
  
  // Check if a quick filter is currently active
  const isFilterActive = (filter: any) => {
    // Simple check - compare selected statuses if they exist
    if (filter.selectedStatuses) {
      return JSON.stringify(currentFilter.selectedStatuses?.sort()) === 
             JSON.stringify(filter.selectedStatuses?.sort());
    }
    
    // Check sort settings
    if (filter.sortBy) {
      return currentFilter.sortBy === filter.sortBy && 
             currentFilter.sortOrder === filter.sortOrder;
    }
    
    return false;
  };

  // In compact mode, show active filters as chips
  if (compact) {
    const activeFilters = [];
    
    if (currentFilter.selectedStatuses?.length > 0) {
      activeFilters.push({
        label: `${currentFilter.selectedStatuses.length} Status${currentFilter.selectedStatuses.length > 1 ? 'es' : ''}`,
        value: currentFilter.selectedStatuses.join(', '),
      });
    }
    
    if (currentFilter.selectedCompanies?.length > 0) {
      activeFilters.push({
        label: `${currentFilter.selectedCompanies.length} Company${currentFilter.selectedCompanies.length > 1 ? 'ies' : 'y'}`,
        value: currentFilter.selectedCompanies.slice(0, 2).join(', ') + 
               (currentFilter.selectedCompanies.length > 2 ? ` +${currentFilter.selectedCompanies.length - 2}` : ''),
      });
    }
    
    if (currentFilter.dateRange?.startDate || currentFilter.dateRange?.endDate) {
      const formatDate = (date: Date) => 
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      let dateLabel = 'Date Range';
      if (currentFilter.dateRange.startDate && currentFilter.dateRange.endDate) {
        dateLabel = `${formatDate(currentFilter.dateRange.startDate)} - ${formatDate(currentFilter.dateRange.endDate)}`;
      } else if (currentFilter.dateRange.startDate) {
        dateLabel = `From ${formatDate(currentFilter.dateRange.startDate)}`;
      } else if (currentFilter.dateRange.endDate) {
        dateLabel = `Until ${formatDate(currentFilter.dateRange.endDate)}`;
      }
      
      activeFilters.push({
        label: 'Date Filter',
        value: dateLabel,
      });
    }

    if (activeFilters.length === 0) return null;

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {activeFilters.map((filter, index) => (
          <Tooltip key={index} title={filter.value} placement="top">
            <Chip
              label={filter.label}
              size="small"
              variant="filled"
              sx={{
                backgroundColor: `${accent}15`,
                color: accent,
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: `${accent}25`,
                },
              }}
            />
          </Tooltip>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {quickFilters.map((filter) => {
          const isActive = isFilterActive(filter.filter);
          const icon = quickFilterIcons[filter.id] || quickFilterIcons.default;
          
          return (
            <Tooltip 
              key={filter.id} 
              title={filter.description || filter.label}
              placement="top"
            >
              <Button
                variant={isActive ? "contained" : "outlined"}
                size="small"
                startIcon={icon}
                onClick={() => onQuickFilterApply(filter)}
                sx={{
                  backgroundColor: isActive ? accent : 'transparent',
                  borderColor: isActive ? accent : 'divider',
                  color: isActive ? 'white' : 'text.primary',
                  fontWeight: 500,
                  minWidth: 'auto',
                  px: 2,
                  py: 0.75,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  '&:hover': {
                    backgroundColor: isActive ? `${accent}DD` : `${accent}15`,
                    borderColor: accent,
                    color: isActive ? 'white' : accent,
                    transform: 'scale(1.02)',
                  },
                  '&:active': {
                    transform: 'scale(0.98)',
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                  {filter.label}
                </Typography>
              </Button>
            </Tooltip>
          );
        })}
      </Box>

      {/* Quick Filter Description */}
      {quickFilters.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Click a filter above to quickly refine your job applications
          </Typography>
        </Box>
      )}

      {/* No Quick Filters Available */}
      {quickFilters.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No quick filters available
          </Typography>
        </Box>
      )}
    </Box>
  );
}