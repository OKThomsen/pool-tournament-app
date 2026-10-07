import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Player {
  id: number;
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  /** YYYY-MM-DD, or null if the handicap has never been changed. */
  lastAdjusted: string | null;
}

export interface PlayerWithStats extends Player {
  participation: number;
  wins: number;
  semifinals: number;
  quarterfinals: number;
}

export interface PlayerInput {
  name: string;
  baseHandicap: number;
  frameHandicap: number;
}

const playersKey = ['players'];

export function usePlayers() {
  return useQuery({ queryKey: playersKey, queryFn: () => api<PlayerWithStats[]>('/players') });
}

export function useCreatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlayerInput) => api<Player>('/players', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playersKey }),
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PlayerInput & { id: number }) =>
      api<Player>(`/players/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playersKey }),
  });
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/players/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playersKey }),
  });
}
