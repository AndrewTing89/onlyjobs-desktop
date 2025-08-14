import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Collapse,
  Divider,
  Badge,
  Chip,
  Button,
  Grid,
} from '@mui/material';
import {
  FilterList,
  ExpandMore,
  ExpandLess,
  Clear,
  Search,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { JobsFilterProps } from '../../types/filter.types';
import StatusFilter from './StatusFilter';
import DateRangeFilter from './DateRangeFilter';
import CompanyFilter from './CompanyFilter';
import QuickFilters from './QuickFilters';

const accent = "#FF7043";

export default function JobsFilter({
  filterState,
  filterOptions,
  onFilterChange,
  jobCount,
}: JobsFilterProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Calculate active filter count
  const activeFilterCount = [
    filterState.selectedStatuses.length > 0,
    filterState.dateRange.startDate || filterState.dateRange.endDate,
    filterState.selectedCompanies.length > 0,
    filterState.searchTerm.length > 0,
  ].filter(Boolean).length;

  const handleExpandToggle = () => {
    setExpanded(!expanded);
    onFilterChange({ showFilters: !expanded });
  };

  const handleResetFilters = () => {
    onFilterChange({
      searchTerm: '',
      selectedStatuses: [],
      dateRange: { startDate: null, endDate: null },
      selectedDatePreset: null,
      selectedCompanies: [],
      selectedLocations: [],
    });
  };

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <Card 
      sx={{ 
        mb: 3,
        overflow: 'visible',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        border: hasActiveFilters ? `2px solid ${accent}` : '1px solid',
        borderColor: hasActiveFilters ? accent : 'divider',
        '&:hover': {
          boxShadow: theme.shadows[4],
        },
      }}
      className="animate-card gpu-accelerated"
    >
      <CardContent sx={{ p: 3, pb: expanded ? 3 : 2 }}>
        {/* Filter Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Badge 
                badgeContent={activeFilterCount} 
                color="primary"
                sx={{
                  '& .MuiBadge-badge': {
                    backgroundColor: accent,
                    color: 'white',
                  },
                }}
              >
                <FilterList sx={{ color: hasActiveFilters ? accent : 'text.secondary' }} />
              </Badge>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 600,
                  color: hasActiveFilters ? accent : 'text.primary',
                }}
              >
                Filters
              </Typography>
            </Box>
            
            {/* Job Count Display */}
            <Typography variant="body2" color="text.secondary">
              {jobCount.filtered} of {jobCount.total} jobs
              {jobCount.filtered !== jobCount.total && (
                <Chip
                  size="small"
                  label="filtered"
                  sx={{
                    ml: 1,
                    backgroundColor: `${accent}15`,
                    color: accent,
                    fontSize: '0.75rem',
                  }}
                />
              )}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasActiveFilters && (
              <Button
                size="small"
                startIcon={<Clear />}
                onClick={handleResetFilters}
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    color: accent,
                    backgroundColor: `${accent}10`,
                  },
                }}
              >
                Clear All
              </Button>
            )}
            
            <IconButton
              onClick={handleExpandToggle}
              sx={{
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                color: expanded ? accent : 'text.secondary',
                '&:hover': {
                  backgroundColor: `${accent}10`,
                  color: accent,
                },
              }}
            >
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
        </Box>

        {/* Quick Filters - Always Visible */}
        {!expanded && hasActiveFilters && (
          <Box sx={{ mt: 2 }}>
            <QuickFilters
              quickFilters={[]}
              currentFilter={filterState}
              onQuickFilterApply={() => {}}
              compact={true}
            />
          </Box>
        )}

        {/* Expanded Filter Controls */}
        <Collapse 
          in={expanded} 
          timeout={300}
          sx={{
            '& .MuiCollapse-wrapper': {
              '& .MuiCollapse-wrapperInner': {
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              },
            },
          }}
        >
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 3 }} />
            
            {/* Quick Filters Section */}
            <Box sx={{ mb: 4 }}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  mb: 2, 
                  fontWeight: 600,
                  color: 'text.primary',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Search sx={{ fontSize: 18 }} />
                Quick Filters
              </Typography>
              <QuickFilters
                quickFilters={[
                  {
                    id: 'recent',
                    label: 'Recent Applications',
                    filter: {
                      sortBy: 'applied_date',
                      sortOrder: 'desc',
                    },
                    description: 'Last 7 days',
                  },
                  {
                    id: 'awaiting-response',
                    label: 'Awaiting Response',
                    filter: {
                      selectedStatuses: ['Applied'],
                    },
                    description: 'Applied status only',
                  },
                  {
                    id: 'in-progress',
                    label: 'Active Pipeline',
                    filter: {
                      selectedStatuses: ['Applied', 'Interviewed'],
                    },
                    description: 'Applied & Interviewed',
                  },
                  {
                    id: 'offers',
                    label: 'Offers Received',
                    filter: {
                      selectedStatuses: ['Offer'],
                    },
                    description: 'Offer status only',
                  },
                ]}
                currentFilter={filterState}
                onQuickFilterApply={(filter) => onFilterChange(filter.filter)}
              />
            </Box>

            {/* Detailed Filters */}
            <Grid container spacing={3}>
              {/* Status Filter */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  Application Status
                </Typography>
                <StatusFilter
                  selectedStatuses={filterState.selectedStatuses}
                  availableStatuses={filterOptions.statuses}
                  onStatusChange={(statuses) => onFilterChange({ selectedStatuses: statuses })}
                />
              </Grid>

              {/* Date Range Filter */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  Application Date
                </Typography>
                <DateRangeFilter
                  dateRange={filterState.dateRange}
                  selectedPreset={filterState.selectedDatePreset}
                  presets={filterOptions.datePresets}
                  onDateRangeChange={(range) => onFilterChange({ dateRange: range })}
                  onPresetChange={(preset) => onFilterChange({ selectedDatePreset: preset })}
                />
              </Grid>

              {/* Company Filter */}
              <Grid size={{ xs: 12 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    mb: 2, 
                    fontWeight: 600,
                    color: 'text.primary',
                  }}
                >
                  Companies
                </Typography>
                <CompanyFilter
                  selectedCompanies={filterState.selectedCompanies}
                  availableCompanies={filterOptions.companies}
                  onCompanyChange={(companies) => onFilterChange({ selectedCompanies: companies })}
                />
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}