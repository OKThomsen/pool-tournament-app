import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { currentSeasonKey } from './seasons';

export interface Player {
  id: number;
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  /** Member this season. */
  member: boolean;
  /** YYYY-MM-DD, or null if the handicap has never been changed. */
  lastAdjusted: string | null;
}

export interface PlayerWithStats extends Player {
  seasonPoints: number;
  participation: number;
  wins: number;
  semifinals: number;
  quarterfinals: number;
}

export interface PlayerInput {
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  member: boolean;
}

const playersKey = ['players'];

/** Player changes can change the season standings too (membership, names). */
function refresh(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: playersKey }),
    queryClient.invalidateQueries({ queryKey: currentSeasonKey }),
  ]);
}

export function usePlayers() {
  return useQuery({ queryKey: playersKey, queryFn: () => api<PlayerWithStats[]>('/players') });
}

export function useCreatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlayerInput) => api<Player>('/players', { method: 'POST', body: input }),
    onSuccess: () => refresh(queryClient),
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PlayerInput & { id: number }) =>
      api<Player>(`/players/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => refresh(queryClient),
  });
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/players/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(queryClient),
  });
}

/** "Tilføj spiller": players whose name starts with the query. Admin only. */
export function useSearchPlayers(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['players', 'search', q.toLowerCase()],
    queryFn: () => api<Player[]>(`/players/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    staleTime: 30_000,
  });
}
