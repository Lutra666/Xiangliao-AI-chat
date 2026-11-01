import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMemories as apiListMemories,
  deleteMemory as apiDeleteMemory,
  updateMemory as apiUpdateMemory,
  consolidateMemories as apiConsolidateMemories,
  createMemory as apiCreateMemory,
} from '../utils/api';

export const MEMORIES_KEY = (sessionId, category = null) => ['memories', sessionId, category];

export function useMemories(sessionId, category = null) {
  return useQuery({
    queryKey: MEMORIES_KEY(sessionId, category),
    queryFn: async () => {
      const data = await apiListMemories(sessionId, category);
      return data || [];
    },
    staleTime: 30 * 1000,
    enabled: !!sessionId,
  });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, content, category }) => apiCreateMemory(sessionId, content, category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
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
    mutationFn: (sessionId) => apiConsolidateMemories(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
