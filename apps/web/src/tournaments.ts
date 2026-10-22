import { continuedPools, MIN_PLAYERS_PER_POOL } from '@franks/core';
import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * Player names with their handicap after them, as /live, /play and the admin's tournament pages
 * show them: "Martin Johansen (-1)".
 */
export function namesWithHandicap(players: readonly Entrant[]): Map<number, string> {
  return new Map(players.map((p) => [p.id, `${p.name} (${p.baseHandicap})`]));
}

export interface Pool {
  id: number;
  name: string;
  /** Frames to win this pool's matches (2 to 5). */
  raceTo: number;
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
  /** Frames to win. Null for a knockout round whose race length the admin hasn't chosen yet. */
  raceTo: number | null;
  framesA: number | null;
  framesB: number | null;
  scheduleOrder: number | null;
}

export interface Tournament {
  id: number;
  date: string;
  week: number;
  /** Null for a tournament in the off-season. */
  season: string | null;
  format: GameFormat;
  status: TournamentStatus;
  knockoutSize: number | null;
  /** An old tournament entered afterwards with its placings only: no pools, matches or seeds. */
  historical: boolean;
  /** "For sjov kamp": played and listed as usual, but left out of every statistic. */
  forFun: boolean;
  players: Entrant[];
  pools: Pool[];
  matches: Match[];
  /** Knockout seeds, best first. Empty before the knockout. */
  seeds: number[];
  /** Final placings, best first. Empty until the tournament is concluded. */
  results: Result[];
}

export type Placement = '1st' | '2nd' | '3rd' | '4th' | '5-8' | 'participation';

export interface Result {
  playerId: number;
  placement: Placement;
  points: number;
  /** Pool matches won. */
  matchesWon: number;
}

/** A concluded tournament in the Turneringer list. */
export interface TournamentSummary {
  id: number;
  date: string;
  week: number;
  /** Null for a tournament in the off-season. */
  season: string | null;
  format: GameFormat;
  forFun: boolean;
  winner: string | null;
  participants: number;
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
      // The ongoing tournament, the history, players and seasons may all have changed.
      return queryClient.invalidateQueries({
        predicate: (query) => query.queryHash !== hashKey(tournamentKey(tournament.id)),
      });
    },
  });
}

/** What Ny Turnering and "Rediger spillere" send. */
export interface TournamentEntry {
  date: string;
  format: GameFormat;
  playerIds: number[];
  forFun: boolean;
}

export function useCreateTournament() {
  return useTournamentMutation((input: TournamentEntry) =>
    api<Tournament>('/tournaments', { method: 'POST', body: input }),
  );
}

/**
 * "Indtast gammel turnering": an old tournament from its placings, players best first (1st, 2nd,
 * 3rd, 4th, the four 5–8 with quarterfinals, then the other participants). Concluded at once.
 */
export function useEnterOldTournament() {
  return useTournamentMutation(
    (input: { date: string; format: GameFormat; knockoutSize: 2 | 4 | 8; playerIds: number[] }) =>
      api<Tournament>('/tournaments/historical', { method: 'POST', body: input }),
  );
}

/** "Rediger spillere": date, format, players and "For sjov kamp", until the knockout starts. */
export function useEditTournament(id: number) {
  return useTournamentMutation((input: TournamentEntry) =>
    api<Tournament>(`/tournaments/${id}`, { method: 'PUT', body: input }),
  );
}

/** "For sjov kamp" on or off, at any time, also after the tournament is concluded. */
export function useSetForFun(id: number) {
  return useTournamentMutation((forFun: boolean) =>
    api<Tournament>(`/tournaments/${id}/for-fun`, { method: 'PUT', body: { forFun } }),
  );
}

/** "Randomize": draws every pool again. Pool results are deleted. */
export function useRandomizePools(id: number) {
  return useTournamentMutation(() =>
    api<Tournament>(`/tournaments/${id}/randomize`, { method: 'POST' }),
  );
}

/** One pool's race length, until the knockout; during the pools only while it has no result. */
export function useSetPoolRace(id: number) {
  return useTournamentMutation((input: { poolId: number; raceTo: number }) =>
    api<Tournament>(`/tournaments/${id}/pools/${input.poolId}/race`, {
      method: 'PUT',
      body: { raceTo: input.raceTo },
    }),
  );
}

/** Swaps two players in the knockout's first round, or brings in one who didn't advance. */
export function useSwapKnockout(id: number) {
  return useTournamentMutation((input: { playerId: number; otherId: number }) =>
    api<Tournament>(`/tournaments/${id}/knockout/swap`, { method: 'PUT', body: input }),
  );
}

/**
 * How many pool results a new arrangement of the pools would delete: those whose two players are
 * no longer both in the pool that continues the match's pool (`continuedPools`, as the server
 * decides it).
 */
export function resultsLost(tournament: Tournament, arrangement: number[][]): number {
  const continued = continuedPools(
    tournament.pools.map((pool) => pool.playerIds.map(String)),
    arrangement.map((pool) => pool.map(String)),
  );
  return tournament.matches.filter((m) => {
    if (m.stage !== 'pool' || m.framesA === null) return false;
    const index = tournament.pools.findIndex((p) => p.id === m.poolId);
    const pool = arrangement[continued.indexOf(index)] ?? [];
    return !pool.includes(m.playerAId!) || !pool.includes(m.playerBId!);
  }).length;
}

/** Whether a pool has a single player: it can't be played, so the pools can't start or close. */
export function hasLonePool(tournament: Tournament): boolean {
  return tournament.pools.some((pool) => pool.playerIds.length < MIN_PLAYERS_PER_POOL);
}

/** How many pool results there are. */
export function poolResults(tournament: Tournament): number {
  return tournament.matches.filter((m) => m.stage === 'pool' && m.framesA !== null).length;
}

export function useSavePools(id: number) {
  return useTournamentMutation((pools: number[][]) =>
    api<Tournament>(`/tournaments/${id}/pools`, { method: 'PUT', body: { pools } }),
  );
}

/** The race lengths the admin can choose for the pool matches (the server's limits, 2–5). */
export const POOL_RACE_MIN = 2;
export const POOL_RACE_MAX = 5;

/** "Gå til turnering": creates the pool matches, each pool with its own race length. */
export function useStartTournament(id: number) {
  return useTournamentMutation(() =>
    api<Tournament>(`/tournaments/${id}/start`, { method: 'POST' }),
  );
}

/** Cancels a tournament in progress, or deletes a concluded one with its points. */
export function useDeleteTournament(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/tournaments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: tournamentKey(id) });
      // The ongoing tournament, the history, players and seasons may all have changed.
      return queryClient.invalidateQueries();
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
  return useTournamentMutation((input: { size: 2 | 4 | 8; adminOrder: number[] }) =>
    api<Tournament>(`/tournaments/${id}/knockout`, { method: 'POST', body: input }),
  );
}

export function useConcludedTournaments() {
  return useQuery({
    queryKey: ['tournaments', 'concluded'],
    queryFn: () => api<TournamentSummary[]>('/tournaments'),
  });
}

/** "conclude tournament". */
export function useConcludeTournament(id: number) {
  return useTournamentMutation(() =>
    api<Tournament>(`/tournaments/${id}/conclude`, { method: 'POST' }),
  );
}

export function useReopenTournament(id: number) {
  return useTournamentMutation(() =>
    api<Tournament>(`/tournaments/${id}/reopen`, { method: 'POST' }),
  );
}

/** The race length for one knockout round, chosen as the knockout goes on. */
export function useSetRace(id: number) {
  return useTournamentMutation((input: { stage: Match['stage']; raceTo: number }) =>
    api<Tournament>(`/tournaments/${id}/knockout/race`, { method: 'PUT', body: input }),
  );
}
