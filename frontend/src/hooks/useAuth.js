import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, register as apiRegister, getMe as apiGetMe } from '../utils/api';
import { useAppStore } from '../store/useAppStore';
import { useChatStore } from '../store/useChatStore';

export function useLogin() {
  return useMutation({
    mutationFn: ({ username, password }) => apiLogin(username, password),
    onSuccess: (data) => {
      useAppStore.getState().setAuth(data.user, data.token);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (form) => apiRegister(form),
    onSuccess: (data) => {
      useAppStore.getState().setAuth(data.user, data.token);
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const data = await apiGetMe();
      useAppStore.getState().setAuth(data, useAppStore.getState().token);
      return data;
    },
    enabled: !!useAppStore.getState().token,
    staleTime: 10 * 60 * 1000,
  });
}

export function useLogout() {
  const clearAuth = useAppStore.getState().clearAuth;
  return () => {
    clearAuth();
    useChatStore.getState().reset();
  };
}
