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

export const currentSeasonKey = ['seasons', 'current'];

export function useCurrentSeason() {
  return useQuery({
    queryKey: currentSeasonKey,
    queryFn: () => api<CurrentSeason>('/seasons/current'),
  });
}
