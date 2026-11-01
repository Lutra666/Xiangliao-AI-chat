import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMemories as apiListMemories,
  deleteMemory as apiDeleteMemory,
  updateMemory as apiUpdateMemory,
  consolidateMemories as apiConsolidateMemories,
} from '../utils/api';

export const MEMORIES_KEY = (category = null) => ['memories', category];

export function useMemories(category = null) {
  return useQuery({
    queryKey: MEMORIES_KEY(category),
    queryFn: async () => {
      const data = await apiListMemories(category);
      return data || [];
    },
    staleTime: 30 * 1000,
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDeleteMemory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiUpdateMemory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}

export function useConsolidateMemories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiConsolidateMemories(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
