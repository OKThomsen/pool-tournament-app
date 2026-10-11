import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, ApiError } from './api';

const playKey = ['play'];

/**
 * The tournament this browser joined on /play, or null when it hasn't (or the code was
 * replaced, or the tournament ended). `undefined` while it's still loading.
 */
export function usePlaySession(): number | null | undefined {
  const { data } = useQuery({
    queryKey: playKey,
    queryFn: async () => {
      try {
        return (await api<{ tournamentId: number }>('/play/me')).tournamentId;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
  return data;
}

/** Checks the player session again, for example after the API refused a result. */
export function useRecheckPlaySession() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: playKey }), [queryClient]);
}

export function useJoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ tournamentId: number }>('/play/join', { method: 'POST', body: { code } }),
    onSuccess: ({ tournamentId }) => queryClient.setQueryData(playKey, tournamentId),
  });
}

export function useLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/play/leave', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(playKey, null),
  });
}

const codeKey = (id: number) => ['tournaments', id, 'code'];

/** The tournament's join code (admins only). */
export function useJoinCode(id: number) {
  return useQuery({
    queryKey: codeKey(id),
    queryFn: () => api<{ code: string | null }>(`/tournaments/${id}/code`).then((b) => b.code),
  });
}

/** "Ny kode": replaces the join code, signing out everyone who used the old one. */
export function useNewJoinCode(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ code: string }>(`/tournaments/${id}/code`, { method: 'POST' }).then((b) => b.code),
    onSuccess: (code) => queryClient.setQueryData(codeKey(id), code),
  });
}
