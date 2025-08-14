// Filter-related TypeScript interfaces for job dashboard filtering

export interface Job {
  id: string;
  gmail_message_id?: string;
  company: string;
  position: string;
  status: string;
  job_type?: string;
  applied_date: string;
  location?: string;
  salary_range?: string;
  notes?: string;
  email_id?: string;
  created_at: string;
  updated_at: string;
  account_email?: string;
  from_address?: string;
  raw_content?: string;
  ml_confidence?: number;
}

export type JobStatus = 'Applied' | 'Interviewed' | 'Offer' | 'Declined';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export interface DatePreset {
  label: string;
  value: string;
  startDate: Date;
  endDate: Date;
}

export interface CompanyOption {
  name: string;
  count: number;
}

export interface FilterState {
  // Search and text filters
  searchTerm: string;
  
  // Status filtering
  selectedStatuses: JobStatus[];
  
  // Date range filtering
  dateRange: DateRange;
  selectedDatePreset: string | null;
  
  // Company filtering
  selectedCompanies: string[];
  
  // Location filtering (optional for future enhancement)
  selectedLocations: string[];
  
  // Sort options
  sortBy: 'applied_date' | 'company' | 'position' | 'status' | 'updated_at';
  sortOrder: 'asc' | 'desc';
  
  // View options
  showFilters: boolean;
}

export interface FilterOptions {
  companies: CompanyOption[];
  locations: string[];
  statuses: JobStatus[];
  datePresets: DatePreset[];
}

export interface QuickFilter {
  id: string;
  label: string;
  icon?: React.ReactElement;
  filter: Partial<FilterState>;
  description?: string;
}

export interface FilterActions {
  updateSearchTerm: (term: string) => void;
  updateStatuses: (statuses: JobStatus[]) => void;
  updateDateRange: (range: DateRange) => void;
  updateDatePreset: (preset: string | null) => void;
  updateCompanies: (companies: string[]) => void;
  updateSort: (sortBy: FilterState['sortBy'], sortOrder: FilterState['sortOrder']) => void;
  toggleFilters: () => void;
  resetFilters: () => void;
  applyQuickFilter: (filter: QuickFilter) => void;
}

export interface FilterContextType {
  filterState: FilterState;
  filterOptions: FilterOptions;
  actions: FilterActions;
  filteredJobs: Job[];
  jobCount: {
    total: number;
    filtered: number;
  };
}

// Props interfaces for filter components
export interface JobsFilterProps {
  filterState: FilterState;
  filterOptions: FilterOptions;
  onFilterChange: (newFilter: Partial<FilterState>) => void;
  jobCount: { total: number; filtered: number };
}

export interface StatusFilterProps {
  selectedStatuses: JobStatus[];
  availableStatuses: JobStatus[];
  onStatusChange: (statuses: JobStatus[]) => void;
}

export interface DateRangeFilterProps {
  dateRange: DateRange;
  selectedPreset: string | null;
  presets: DatePreset[];
  onDateRangeChange: (range: DateRange) => void;
  onPresetChange: (preset: string | null) => void;
}

export interface CompanyFilterProps {
  selectedCompanies: string[];
  availableCompanies: CompanyOption[];
  onCompanyChange: (companies: string[]) => void;
}

export interface QuickFiltersProps {
  quickFilters: QuickFilter[];
  currentFilter: FilterState;
  onQuickFilterApply: (filter: QuickFilter) => void;
}

// Utility types for enhanced filtering
export interface FilterValidation {
  isValid: boolean;
  errors: string[];
}

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filter: FilterState;
  isSystem?: boolean;
  createdAt: Date;
}