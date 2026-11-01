import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLLMProviders as apiGetProviders,
  switchLLMProvider as apiSwitchProvider,
  getLLMMetrics as apiGetMetrics,
} from '../utils/api';

export const PROVIDERS_KEY = ['llmProviders'];
export const METRICS_KEY = ['llmMetrics'];

export function useLLMProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: async () => {
      const data = await apiGetProviders();
      return data || [];
    },
    staleTime: 60 * 1000,
  });
}

export function useLLMMetrics() {
  return useQuery({
    queryKey: METRICS_KEY,
    queryFn: async () => {
      const data = await apiGetMetrics();
      return data || {};
    },
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useSwitchLLMProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider) => apiSwitchProvider(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
      qc.invalidateQueries({ queryKey: METRICS_KEY });
    },
  });
}
