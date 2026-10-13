import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface SeasonStanding {
  rank: number;
  playerId: number;
  name: string;
  /** Earns the member bonus this season. */
  member: boolean;
  points: number;
  participation: number;
  wins: number;
  semifinals: number;
  quarterfinals: number;
}

export interface Season {
  /** `1/2026` (January–May) or `2/2026` (September–December). */
  label: string;
  start: string;
  end: string;
}

export interface CurrentSeason {
  /** Null in the off-season (June–August). */
  season: Season | null;
  /** The season after today. */
  next: Season;
  /** Empty in the off-season. */
  standings: SeasonStanding[];
}

/** Every season query: membership changes can move points in any season. */
export const seasonsKey = ['seasons'];
export const currentSeasonKey = ['seasons', 'current'];

export function useCurrentSeason() {
  return useQuery({
    queryKey: currentSeasonKey,
    queryFn: () => api<CurrentSeason>('/seasons/current'),
  });
}

/** The URL form of a season label: `1/2026` → `1-2026`. */
export const seasonId = (label: string) => label.replace('/', '-');

/** Seasons with a concluded tournament, plus the current one, newest first. */
export function useSeasons() {
  return useQuery({
    queryKey: ['seasons', 'list'],
    queryFn: () => api<Season[]>('/seasons'),
  });
}

/** One season and its standings, by id (`1-2026`). */
export function useSeason(id: string | undefined) {
  return useQuery({
    queryKey: ['seasons', 'one', id],
    queryFn: () => api<{ season: Season; standings: SeasonStanding[] }>(`/seasons/${id}`),
    enabled: id !== undefined,
  });
}
