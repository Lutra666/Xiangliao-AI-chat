import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSettings as apiGetSettings,
  updateSettings as apiUpdateSettings,
  listModels as apiListModels,
} from '../utils/api';

export const SETTINGS_KEY = ['settings'];
export const MODELS_KEY = ['models'];

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const data = await apiGetSettings();
      return data || {};
    },
    staleTime: 60 * 1000,
  });
}

export function useListModels() {
  return useQuery({
    queryKey: MODELS_KEY,
    queryFn: async () => {
      const data = await apiListModels();
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiUpdateSettings(data),
    // 乐观更新：UI 立即反映，失败回滚
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = qc.getQueryData(SETTINGS_KEY);
      qc.setQueryData(SETTINGS_KEY, (old) => ({ ...old, ...data }));
      return { prev };
    },
    onError: (_e, _data, ctx) => {
      qc.setQueryData(SETTINGS_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
