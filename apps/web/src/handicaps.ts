import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './auth';

export type Direction = 'harder' | 'easier';

export interface PendingRecommendation {
  /** The tournament that took the score to ±2. */
  tournamentId: number;
  date: string;
  direction: Direction;
  /** The handicap after applying it, or null at the end of the ladder (dismiss only). */
  next: { base: number; frame: number } | null;
}

export interface PlayerRegulation {
  id: number;
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  lastAdjusted: string | null;
  /** −1, 0 or 1 today; hidden from players. */
  score: number;
  /** When the ±1 runs out (YYYY-MM-DD), or null at 0. */
  expires: string | null;
  pending: PendingRecommendation[];
}

export type RegulationStep =
  | {
      kind: 'tournament';
      tournamentId: number;
      date: string;
      format: string;
      historical: boolean;
      placement: string;
      /** Null for an old tournament, whose pool wins aren't known. */
      poolWins: number | null;
      baseHandicap: number;
      frameHandicap: number;
      change: -1 | 0 | 1;
      score: number;
      recommendation: Direction | null;
    }
  | {
      kind: 'reset';
      reason: 'manual' | 'applied' | 'dismissed';
      tournamentId: number | null;
      date: string;
      oldBase: number;
      oldFrame: number;
      newBase: number;
      newFrame: number;
    }
  | { kind: 'set'; date: string; score: -1 | 0 | 1 }
  | { kind: 'expired'; date: string };

export interface PlayerRegulationDetail extends PlayerRegulation {
  /** Newest first. */
  history: RegulationStep[];
}

export const handicapsKey = ['handicaps'];

/** Every player's regulation. Only fetched for admins (the API refuses everyone else). */
export function useHandicaps() {
  const admin = useSession();
  return useQuery({
    queryKey: handicapsKey,
    queryFn: () => api<PlayerRegulation[]>('/handicaps'),
    enabled: Boolean(admin),
  });
}

/** Players with a recommendation waiting for the admin. */
export function usePendingHandicaps(): PlayerRegulation[] {
  return useHandicaps().data?.filter((player) => player.pending.length > 0) ?? [];
}

export function usePlayerRegulation(id: number) {
  return useQuery({
    queryKey: [...handicapsKey, id],
    queryFn: () => api<PlayerRegulationDetail>(`/handicaps/${id}`),
  });
}

export function useResolveRecommendation(playerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, action }: { tournamentId: number; action: 'apply' | 'dismiss' }) =>
      api<PlayerRegulationDetail>(`/handicaps/${playerId}/recommendations/${tournamentId}`, {
        method: 'POST',
        body: { action },
      }),
    // Applying changes the handicap, which Spillere and the tournament pages show too.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Sets the regulation score by hand as it stood at the end of `date`. */
export function useSetRegulationScore(playerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { score: -1 | 0 | 1; date: string }) =>
      api<PlayerRegulationDetail>(`/handicaps/${playerId}/score`, { method: 'PUT', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: handicapsKey }),
  });
}

/** A handicap as the workbook writes it: "+2", "0", "-4 (-2)" with a frame handicap. */
export function formatHandicap(base: number, frame: number): string {
  const text = base > 0 ? `+${base}` : String(base);
  return frame === 0 ? text : `${text} (${frame})`;
}

/** "+1", "0", "-1". */
export function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}
