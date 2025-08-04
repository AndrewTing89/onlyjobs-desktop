// useApi.ts
import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api.service';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseApiOptions {
  immediate?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export function useApi<T>(
  endpoint: string,
  options: UseApiOptions = {}
) {
  const { immediate = true, onSuccess, onError } = options;
  
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: immediate,
    error: null,
  });

  const execute = useCallback(async (params?: any) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const data = await apiService.get<T>(endpoint);
      setState({ data, loading: false, error: null });
      onSuccess?.(data);
      return data;
    } catch (error) {
      const err = error as Error;
      setState({ data: null, loading: false, error: err });
      onError?.(err);
      throw err;
    }
  }, [endpoint, onSuccess, onError]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate]);

  const refetch = () => execute();

  return { ...state, refetch, execute };
}