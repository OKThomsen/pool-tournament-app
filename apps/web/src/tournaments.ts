import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type GameFormat = '8-ball' | '9-ball' | '10-ball';
export type TournamentStatus = 'draft' | 'pools' | 'knockout' | 'concluded';

export interface Entrant {
  id: number;
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  member: boolean;
}

export interface Pool {
  id: number;
  name: string;
  playerIds: number[];
  /** The admin's order for ties that results can't break, best first. */
  tiebreak: number[];
}

export interface Match {
  id: number;
  stage: 'pool' | 'QF' | 'SF' | 'THIRD' | 'FINAL';
  poolId: number | null;
  slot: string | null;
  playerAId: number | null;
  playerBId: number | null;
  raceTo: number;
  framesA: number | null;
  framesB: number | null;
  scheduleOrder: number | null;
}

export interface Tournament {
  id: number;
  date: string;
  week: number;
  season: string;
  format: GameFormat;
  status: TournamentStatus;
  knockoutSize: number | null;
  players: Entrant[];
  pools: Pool[];
  matches: Match[];
  /** Knockout seeds, best first. Empty before the knockout. */
  seeds: number[];
}

export const tournamentKey = (id: number) => ['tournaments', id];
const ongoingKey = ['tournaments', 'ongoing'];

export function useOngoingTournament() {
  return useQuery({
    queryKey: ongoingKey,
    queryFn: () =>
      api<{ tournament: { id: number; date: string; status: TournamentStatus } | null }>(
        '/tournaments/ongoing',
      ).then((body) => body.tournament),
  });
}

export function useTournament(id: number) {
  return useQuery({
    queryKey: tournamentKey(id),
    queryFn: () => api<Tournament>(`/tournaments/${id}`),
  });
}

/** Mutations answer with the updated tournament; store it so the page updates at once. */
function useTournamentMutation<Input>(request: (input: Input) => Promise<Tournament>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (tournament) => {
      queryClient.setQueryData(tournamentKey(tournament.id), tournament);
      return queryClient.invalidateQueries({ queryKey: ongoingKey });
    },
  });
}

export function useCreateTournament() {
  return useTournamentMutation((input: { date: string; format: GameFormat; playerIds: number[] }) =>
    api<Tournament>('/tournaments', { method: 'POST', body: input }),
  );
}

export function useSavePools(id: number) {
  return useTournamentMutation((pools: number[][]) =>
    api<Tournament>(`/tournaments/${id}/pools`, { method: 'PUT', body: { pools } }),
  );
}

export function useStartTournament(id: number) {
  return useTournamentMutation(() =>
    api<Tournament>(`/tournaments/${id}/start`, { method: 'POST' }),
  );
}

export function useCancelTournament(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/tournaments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: tournamentKey(id) });
      return queryClient.invalidateQueries({ queryKey: ongoingKey });
    },
  });
}

export function useSetResult(id: number) {
  return useTournamentMutation((input: { matchId: number; framesA: number; framesB: number }) =>
    api<Tournament>(`/tournaments/${id}/matches/${input.matchId}/result`, {
      method: 'PUT',
      body: { framesA: input.framesA, framesB: input.framesB },
    }),
  );
}

export function useClearResult(id: number) {
  return useTournamentMutation((matchId: number) =>
    api<Tournament>(`/tournaments/${id}/matches/${matchId}/result`, { method: 'DELETE' }),
  );
}

export function useSetPoolTiebreak(id: number) {
  return useTournamentMutation((input: { poolId: number; playerIds: number[] }) =>
    api<Tournament>(`/tournaments/${id}/pools/${input.poolId}/tiebreak`, {
      method: 'PUT',
      body: { playerIds: input.playerIds },
    }),
  );
}

/** "complete qualifier brackets". */
export function useStartKnockout(id: number) {
  return useTournamentMutation((input: { size: 4 | 8; raceTo: number; adminOrder: number[] }) =>
    api<Tournament>(`/tournaments/${id}/knockout`, { method: 'POST', body: input }),
  );
}
