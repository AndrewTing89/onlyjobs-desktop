import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Button,
  Stack,
  Alert,
  Typography,
  FormControl,
  InputLabel,
  Select,
  FormHelperText,
  Divider
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Job, JobStatus } from '../types/filter.types';

const jobStatuses: JobStatus[] = ['Applied', 'Interviewed', 'Declined', 'Offer'];

export interface JobFormData {
  company: string;
  position: string;
  status: JobStatus;
  applied_date: string;
  location?: string;
  salary_range?: string;
  notes?: string;
}

interface JobRecordFormProps {
  initialData?: Partial<Job>;
  onSubmit: (data: JobFormData) => void;
  onCancel: () => void;
  loading?: boolean;
  mode: 'create' | 'edit';
}

interface FormErrors {
  company?: string;
  position?: string;
  status?: string;
  applied_date?: string;
  location?: string;
  salary_range?: string;
  notes?: string;
}

export const JobRecordForm: React.FC<JobRecordFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  mode
}) => {
  const [formData, setFormData] = useState<JobFormData>({
    company: initialData?.company || '',
    position: initialData?.position || '',
    status: (initialData?.status as JobStatus) || 'Applied',
    applied_date: initialData?.applied_date || new Date().toISOString().split('T')[0],
    location: initialData?.location || '',
    salary_range: initialData?.salary_range || '',
    notes: initialData?.notes || ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        company: initialData.company || '',
        position: initialData.position || '',
        status: (initialData.status as JobStatus) || 'Applied',
        applied_date: initialData.applied_date || new Date().toISOString().split('T')[0],
        location: initialData.location || '',
        salary_range: initialData.salary_range || '',
        notes: initialData.notes || ''
      });
    }
  }, [initialData]);

  const validateField = (name: string, value: string): string | undefined => {
    switch (name) {
      case 'company':
        if (!value.trim()) return 'Company name is required';
        if (value.trim().length < 2) return 'Company name must be at least 2 characters';
        if (value.trim().length > 100) return 'Company name must be less than 100 characters';
        break;
      case 'position':
        if (!value.trim()) return 'Position title is required';
        if (value.trim().length < 2) return 'Position title must be at least 2 characters';
        if (value.trim().length > 100) return 'Position title must be less than 100 characters';
        break;
      case 'location':
        if (value && value.length > 100) return 'Location must be less than 100 characters';
        break;
      case 'salary_range':
        if (value && value.length > 50) return 'Salary range must be less than 50 characters';
        break;
      case 'notes':
        if (value && value.length > 1000) return 'Notes must be less than 1000 characters';
        break;
      case 'applied_date':
        if (!value) return 'Applied date is required';
        const date = new Date(value);
        if (isNaN(date.getTime())) return 'Invalid date format';
        if (date > new Date()) return 'Applied date cannot be in the future';
        break;
    }
    return undefined;
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    // Validate all fields
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key as keyof JobFormData] || '');
      if (error) {
        newErrors[key as keyof FormErrors] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleInputChange = (field: keyof JobFormData) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Real-time validation
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const handleSelectChange = (field: keyof JobFormData) => (
    event: any
  ) => {
    const value = event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const handleDateChange = (date: Date | null) => {
    const dateString = date ? date.toISOString().split('T')[0] : '';
    setFormData(prev => ({ ...prev, applied_date: dateString }));
    
    if (touched.applied_date) {
      const error = validateField('applied_date', dateString);
      setErrors(prev => ({ ...prev, applied_date: error }));
    }
  };

  const handleBlur = (field: string) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const value = formData[field as keyof JobFormData] || '';
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    // Mark all fields as touched
    const allTouched = Object.keys(formData).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setTouched(allTouched);

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const hasErrors = Object.values(errors).some(error => !!error);
  const isFormValid = !hasErrors && (formData.company.trim() && formData.position.trim());

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
        <Stack spacing={3}>
          <Typography variant="h6" gutterBottom>
            {mode === 'create' ? 'Add New Job Application' : 'Edit Job Application'}
          </Typography>
          
          <Divider />

          {/* Required Fields Section */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Required Information
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Company"
                value={formData.company}
                onChange={handleInputChange('company')}
                onBlur={handleBlur('company')}
                error={touched.company && !!errors.company}
                helperText={touched.company && errors.company}
                required
                fullWidth
                autoFocus={mode === 'create'}
                disabled={loading}
                placeholder="e.g., Google, Microsoft, OpenAI"
              />

              <TextField
                label="Position"
                value={formData.position}
                onChange={handleInputChange('position')}
                onBlur={handleBlur('position')}
                error={touched.position && !!errors.position}
                helperText={touched.position && errors.position}
                required
                fullWidth
                disabled={loading}
                placeholder="e.g., Software Engineer, Product Manager"
              />

              <FormControl fullWidth disabled={loading}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={handleSelectChange('status')}
                  onBlur={handleBlur('status')}
                  error={touched.status && !!errors.status}
                >
                  {jobStatuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
                {touched.status && errors.status && (
                  <FormHelperText error>{errors.status}</FormHelperText>
                )}
              </FormControl>

              <DatePicker
                label="Applied Date"
                value={formData.applied_date ? new Date(formData.applied_date) : null}
                onChange={handleDateChange}
                disabled={loading}
                maxDate={new Date()}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: touched.applied_date && !!errors.applied_date,
                    helperText: touched.applied_date && errors.applied_date,
                    onBlur: handleBlur('applied_date')
                  }
                }}
              />
            </Stack>
          </Box>

          {/* Optional Fields Section */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Additional Information (Optional)
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Location"
                value={formData.location}
                onChange={handleInputChange('location')}
                onBlur={handleBlur('location')}
                error={touched.location && !!errors.location}
                helperText={touched.location && errors.location}
                fullWidth
                disabled={loading}
                placeholder="e.g., San Francisco, CA or Remote"
              />

              <TextField
                label="Salary Range"
                value={formData.salary_range}
                onChange={handleInputChange('salary_range')}
                onBlur={handleBlur('salary_range')}
                error={touched.salary_range && !!errors.salary_range}
                helperText={touched.salary_range && errors.salary_range}
                fullWidth
                disabled={loading}
                placeholder="e.g., $100k - $150k, $80/hour"
              />

              <TextField
                label="Notes"
                value={formData.notes}
                onChange={handleInputChange('notes')}
                onBlur={handleBlur('notes')}
                error={touched.notes && !!errors.notes}
                helperText={touched.notes && errors.notes || `${(formData.notes || '').length}/1000 characters`}
                fullWidth
                multiline
                rows={3}
                disabled={loading}
                placeholder="Additional notes about this application..."
              />
            </Stack>
          </Box>

          {/* Error Summary */}
          {hasErrors && Object.values(touched).some(t => t) && (
            <Alert severity="error">
              Please fix the errors above before submitting.
            </Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 2 }}>
            <Button
              variant="outlined"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !isFormValid}
              sx={{
                minWidth: 120,
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)'
                }
              }}
            >
              {loading ? 'Saving...' : mode === 'create' ? 'Add Job' : 'Save Changes'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </LocalizationProvider>
  );
};

export default JobRecordForm;