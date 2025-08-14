import React, { useState, useMemo } from 'react';
import {
  Box,
  Autocomplete,
  TextField,
  Chip,
  Typography,
  InputAdornment,
  Button,
} from '@mui/material';
import {
  Business,
  Clear,
  Search,
} from '@mui/icons-material';
import { CompanyFilterProps } from '../../types/filter.types';

const accent = "#FF7043";

export default function CompanyFilter({
  selectedCompanies,
  availableCompanies,
  onCompanyChange,
}: CompanyFilterProps) {
  const [inputValue, setInputValue] = useState('');

  // Sort companies by application count (descending) and then alphabetically
  const sortedCompanies = useMemo(() => {
    return [...availableCompanies].sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
  }, [availableCompanies]);

  const handleCompanySelect = (companies: string[]) => {
    onCompanyChange(companies);
  };

  const handleClearAll = () => {
    onCompanyChange([]);
  };

  const handleSelectTop = (count: number) => {
    const topCompanies = sortedCompanies.slice(0, count).map(c => c.name);
    onCompanyChange(topCompanies);
  };

  const getCompanyOption = (companyName: string) => {
    return availableCompanies.find(c => c.name === companyName);
  };

  return (
    <Box>
      {/* Quick Selection Buttons */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => handleSelectTop(5)}
          sx={{
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': {
              borderColor: accent,
              color: accent,
              backgroundColor: `${accent}10`,
            },
          }}
        >
          Top 5 Companies
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => handleSelectTop(10)}
          sx={{
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': {
              borderColor: accent,
              color: accent,
              backgroundColor: `${accent}10`,
            },
          }}
        >
          Top 10 Companies
        </Button>
        {selectedCompanies.length > 0 && (
          <Button
            size="small"
            startIcon={<Clear />}
            onClick={handleClearAll}
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
      </Box>

      {/* Company Autocomplete */}
      <Autocomplete
        multiple
        options={sortedCompanies.map(c => c.name)}
        value={selectedCompanies}
        onChange={(_, newValue) => handleCompanySelect(newValue)}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
        filterSelectedOptions
        size="small"
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={selectedCompanies.length === 0 ? "Search and select companies..." : "Add more companies..."}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <Business sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                '&:hover': {
                  boxShadow: `0 2px 8px ${accent}20`,
                },
                '&.Mui-focused': {
                  boxShadow: `0 0 0 3px ${accent}30`,
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
        )}
        renderOption={(props, option) => {
          const company = getCompanyOption(option);
          return (
            <Box component="li" {...props}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Business sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2">
                    {option}
                  </Typography>
                </Box>
                <Chip
                  label={company?.count || 0}
                  size="small"
                  sx={{
                    backgroundColor: `${accent}15`,
                    color: accent,
                    fontSize: '0.75rem',
                    height: 20,
                  }}
                />
              </Box>
            </Box>
          );
        }}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const company = getCompanyOption(option);
            return (
              <Chip
                {...getTagProps({ index })}
                key={option}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {option}
                    </Typography>
                    {company && (
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        ({company.count})
                      </Typography>
                    )}
                  </Box>
                }
                size="small"
                sx={{
                  backgroundColor: `${accent}15`,
                  color: accent,
                  border: `1px solid ${accent}40`,
                  '& .MuiChip-deleteIcon': {
                    color: accent,
                    '&:hover': {
                      color: `${accent}DD`,
                    },
                  },
                }}
              />
            );
          })
        }
        sx={{
          '& .MuiAutocomplete-popupIndicator': {
            color: 'text.secondary',
            '&:hover': {
              color: accent,
            },
          },
          '& .MuiAutocomplete-clearIndicator': {
            color: 'text.secondary',
            '&:hover': {
              color: accent,
            },
          },
        }}
      />

      {/* Selected Companies Summary */}
      {selectedCompanies.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {selectedCompanies.length} companies selected
            {selectedCompanies.length > 0 && (
              <>
                {' • '}
                {selectedCompanies
                  .map(company => getCompanyOption(company)?.count || 0)
                  .reduce((sum, count) => sum + count, 0)} applications
              </>
            )}
          </Typography>
        </Box>
      )}

      {/* No Companies Available */}
      {availableCompanies.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No companies available for filtering
          </Typography>
        </Box>
      )}
    </Box>
  );
}