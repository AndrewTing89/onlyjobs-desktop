import { useState, useMemo, useCallback } from 'react';
import { 
  FilterState, 
  FilterOptions, 
  Job, 
  JobStatus, 
  CompanyOption,
  DatePreset 
} from '../types/filter.types';

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

// Initial filter state
const initialFilterState: FilterState = {
  searchTerm: '',
  selectedStatuses: [],
  dateRange: { startDate: null, endDate: null },
  selectedDatePreset: null,
  selectedCompanies: [],
  selectedLocations: [],
  sortBy: 'applied_date',
  sortOrder: 'desc',
  showFilters: false,
};

export function useJobFilters(jobs: Job[]) {
  const [filterState, setFilterState] = useState<FilterState>(initialFilterState);

  // Generate filter options from jobs data
  const filterOptions = useMemo((): FilterOptions => {
    const companies: CompanyOption[] = [];
    const locations: string[] = [];
    const statuses: JobStatus[] = ['Applied', 'Interviewed', 'Offer', 'Declined'];

    // Count companies and locations
    const companyMap = new Map<string, number>();
    const locationSet = new Set<string>();

    jobs.forEach(job => {
      // Count companies
      const company = job.company || 'Unknown Company';
      companyMap.set(company, (companyMap.get(company) || 0) + 1);

      // Collect locations
      if (job.location) {
        locationSet.add(job.location);
      }
    });

    // Convert to arrays
    companyMap.forEach((count, name) => {
      companies.push({ name, count });
    });

    locationSet.forEach(location => {
      locations.push(location);
    });

    // Sort companies by count (descending) then alphabetically
    companies.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    // Sort locations alphabetically
    locations.sort();

    return {
      companies,
      locations,
      statuses,
      datePresets: generateDatePresets(),
    };
  }, [jobs]);

  // Filter jobs based on current filter state
  const filteredJobs = useMemo(() => {
    let filtered = [...jobs];

    // Search term filter
    if (filterState.searchTerm) {
      const searchLower = filterState.searchTerm.toLowerCase();
      filtered = filtered.filter(job =>
        (job.company || '').toLowerCase().includes(searchLower) ||
        (job.position || '').toLowerCase().includes(searchLower) ||
        (job.location || '').toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (filterState.selectedStatuses.length > 0) {
      filtered = filtered.filter(job =>
        filterState.selectedStatuses.includes(job.status as JobStatus)
      );
    }

    // Date range filter
    if (filterState.dateRange.startDate || filterState.dateRange.endDate) {
      filtered = filtered.filter(job => {
        const jobDate = new Date(job.applied_date);
        const start = filterState.dateRange.startDate;
        const end = filterState.dateRange.endDate;

        if (start && end) {
          return jobDate >= start && jobDate <= end;
        } else if (start) {
          return jobDate >= start;
        } else if (end) {
          return jobDate <= end;
        }
        return true;
      });
    }

    // Company filter
    if (filterState.selectedCompanies.length > 0) {
      filtered = filtered.filter(job =>
        filterState.selectedCompanies.includes(job.company || 'Unknown Company')
      );
    }

    // Location filter
    if (filterState.selectedLocations.length > 0) {
      filtered = filtered.filter(job =>
        job.location && filterState.selectedLocations.includes(job.location)
      );
    }

    // Sort filtered results
    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (filterState.sortBy) {
        case 'applied_date':
          compareValue = new Date(a.applied_date).getTime() - new Date(b.applied_date).getTime();
          break;
        case 'company':
          compareValue = (a.company || '').localeCompare(b.company || '');
          break;
        case 'position':
          compareValue = (a.position || '').localeCompare(b.position || '');
          break;
        case 'status':
          compareValue = a.status.localeCompare(b.status);
          break;
        case 'updated_at':
          compareValue = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        default:
          compareValue = 0;
      }

      return filterState.sortOrder === 'desc' ? -compareValue : compareValue;
    });

    return filtered;
  }, [jobs, filterState]);

  // Actions for updating filter state
  const updateFilter = useCallback((updates: Partial<FilterState>) => {
    setFilterState(prev => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState(initialFilterState);
  }, []);

  const updateSearchTerm = useCallback((term: string) => {
    updateFilter({ searchTerm: term });
  }, [updateFilter]);

  const updateStatuses = useCallback((statuses: JobStatus[]) => {
    updateFilter({ selectedStatuses: statuses });
  }, [updateFilter]);

  const updateDateRange = useCallback((range: FilterState['dateRange']) => {
    updateFilter({ dateRange: range, selectedDatePreset: null });
  }, [updateFilter]);

  const updateDatePreset = useCallback((preset: string | null) => {
    updateFilter({ selectedDatePreset: preset });
  }, [updateFilter]);

  const updateCompanies = useCallback((companies: string[]) => {
    updateFilter({ selectedCompanies: companies });
  }, [updateFilter]);

  const updateSort = useCallback((sortBy: FilterState['sortBy'], sortOrder: FilterState['sortOrder']) => {
    updateFilter({ sortBy, sortOrder });
  }, [updateFilter]);

  const toggleFilters = useCallback(() => {
    updateFilter({ showFilters: !filterState.showFilters });
  }, [updateFilter, filterState.showFilters]);

  return {
    filterState,
    filterOptions,
    filteredJobs,
    jobCount: {
      total: jobs.length,
      filtered: filteredJobs.length,
    },
    actions: {
      updateFilter,
      resetFilters,
      updateSearchTerm,
      updateStatuses,
      updateDateRange,
      updateDatePreset,
      updateCompanies,
      updateSort,
      toggleFilters,
    },
  };
}