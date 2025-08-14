import React from 'react';
import {
  Box,
  Chip,
  Typography,
} from '@mui/material';
import {
  CheckCircle,
  Schedule,
  Star,
  Cancel,
} from '@mui/icons-material';
import { StatusFilterProps, JobStatus } from '../../types/filter.types';

const accent = "#FF7043";

const statusConfig: Record<JobStatus, { color: string; icon: React.ReactElement; label: string }> = {
  Applied: {
    color: '#2196F3',
    icon: <Schedule sx={{ fontSize: 16 }} />,
    label: 'Applied',
  },
  Interviewed: {
    color: '#FF9800',
    icon: <CheckCircle sx={{ fontSize: 16 }} />,
    label: 'Interviewed',
  },
  Offer: {
    color: '#9C27B0',
    icon: <Star sx={{ fontSize: 16 }} />,
    label: 'Offer',
  },
  Declined: {
    color: '#F44336',
    icon: <Cancel sx={{ fontSize: 16 }} />,
    label: 'Declined',
  },
};

export default function StatusFilter({
  selectedStatuses,
  availableStatuses,
  onStatusChange,
}: StatusFilterProps) {
  const handleStatusToggle = (status: JobStatus) => {
    const newSelectedStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    
    onStatusChange(newSelectedStatuses);
  };

  const handleSelectAll = () => {
    if (selectedStatuses.length === availableStatuses.length) {
      onStatusChange([]);
    } else {
      onStatusChange([...availableStatuses]);
    }
  };

  const allSelected = selectedStatuses.length === availableStatuses.length;
  const someSelected = selectedStatuses.length > 0;

  return (
    <Box>
      {/* Select All Toggle */}
      <Box sx={{ mb: 2 }}>
        <Chip
          label={allSelected ? "Deselect All" : "Select All"}
          variant={someSelected && !allSelected ? "outlined" : allSelected ? "filled" : "outlined"}
          size="small"
          onClick={handleSelectAll}
          sx={{
            backgroundColor: allSelected ? `${accent}` : someSelected ? `${accent}15` : 'transparent',
            color: allSelected ? 'white' : someSelected ? accent : 'text.secondary',
            borderColor: allSelected || someSelected ? accent : 'divider',
            fontWeight: 500,
            transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            '&:hover': {
              backgroundColor: allSelected ? `${accent}DD` : `${accent}20`,
              borderColor: accent,
              transform: 'scale(1.02)',
            },
          }}
        />
      </Box>

      {/* Status Chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {availableStatuses.map((status) => {
          const config = statusConfig[status];
          const isSelected = selectedStatuses.includes(status);
          
          return (
            <Chip
              key={status}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {config.icon}
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {config.label}
                  </Typography>
                </Box>
              }
              variant={isSelected ? "filled" : "outlined"}
              clickable
              onClick={() => handleStatusToggle(status)}
              sx={{
                backgroundColor: isSelected 
                  ? `${config.color}` 
                  : 'transparent',
                color: isSelected 
                  ? 'white' 
                  : config.color,
                borderColor: config.color,
                borderWidth: isSelected ? 2 : 1,
                fontWeight: 500,
                height: 36,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                '&:hover': {
                  backgroundColor: isSelected 
                    ? `${config.color}DD` 
                    : `${config.color}15`,
                  transform: 'scale(1.05)',
                  boxShadow: `0 2px 8px ${config.color}40`,
                },
                '&:active': {
                  transform: 'scale(0.98)',
                },
                '& .MuiChip-label': {
                  px: 1.5,
                },
              }}
            />
          );
        })}
      </Box>

      {/* Selected Count Display */}
      {someSelected && (
        <Box sx={{ mt: 2 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary',
              fontStyle: 'italic',
            }}
          >
            {selectedStatuses.length} of {availableStatuses.length} statuses selected
          </Typography>
        </Box>
      )}
    </Box>
  );
}