import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSessions as apiGetSessions,
  deleteSession as apiDeleteSession,
  inheritSession as apiInheritSession,
  getHistory as apiGetHistory,
} from '../utils/api';

export const SESSIONS_KEY = ['sessions'];

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const data = await apiGetSessions();
      return data || [];
    },
    staleTime: 15 * 1000,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) => apiDeleteSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useInheritSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) => apiInheritSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

// 会话历史：按 sessionId 缓存，切换会话时自动取用
export function useHistory(sessionId) {
  return useQuery({
    queryKey: ['history', sessionId],
    queryFn: async () => {
      const data = await apiGetHistory(sessionId);
      return {
        messages: data.messages || [],
        title: data.title || '',
        totalTokens: data.total_tokens_used || 0,
        characterId: data.character_id || null,
      };
    },
    enabled: !!sessionId,
    staleTime: 0, // 每次切换都重新拉，避免脏数据
  });
}
