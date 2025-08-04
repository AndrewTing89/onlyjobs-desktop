// validation.utils.ts
export const validators = {
    required: (value: any): string | null => {
      if (!value || (typeof value === 'string' && !value.trim())) {
        return 'This field is required';
      }
      return null;
    },
  
    email: (value: string): string | null => {
      if (!value) return null;
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(value) ? null : 'Invalid email address';
    },
  
    minLength: (min: number) => (value: string): string | null => {
      if (!value) return null;
      return value.length >= min ? null : `Must be at least ${min} characters`;
    },
  
    maxLength: (max: number) => (value: string): string | null => {
      if (!value) return null;
      return value.length <= max ? null : `Must be no more than ${max} characters`;
    },
  
    pattern: (pattern: RegExp, message: string) => (value: string): string | null => {
      if (!value) return null;
      return pattern.test(value) ? null : message;
    },
  
    url: (value: string): string | null => {
      if (!value) return null;
      try {
        new URL(value);
        return null;
      } catch {
        return 'Invalid URL';
      }
    },
  };
  
  export const composeValidators = (...validators: Array<(value: any) => string | null>) => {
    return (value: any): string | null => {
      for (const validator of validators) {
        const error = validator(value);
        if (error) return error;
      }
      return null;
    };
  };