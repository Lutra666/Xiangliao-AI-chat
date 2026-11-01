import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listCharacters as apiListCharacters,
  createCharacter as apiCreateCharacter,
  updateCharacter as apiUpdateCharacter,
  deleteCharacter as apiDeleteCharacter,
  setDefaultCharacter as apiSetDefaultCharacter,
} from '../utils/api';
import { getServerUrl } from '../store/useAppStore';

export const CHARACTERS_KEY = (includeBuiltin = true) => ['characters', includeBuiltin];

export function useCharacters(includeBuiltin = true) {
  return useQuery({
    queryKey: CHARACTERS_KEY(includeBuiltin),
    queryFn: async () => {
      const data = await apiListCharacters(includeBuiltin);
      return data || [];
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiCreateCharacter(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useUpdateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiUpdateCharacter(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDeleteCharacter(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useSetDefaultCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiSetDefaultCharacter(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

// 头像上传：单独的 fetch（FormData），不走 request 封装
export async function uploadCharacterAvatar(file) {
  const token = localStorage.getItem('token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${getServerUrl()}/api/characters/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('头像上传失败');
  return res.json();
}
