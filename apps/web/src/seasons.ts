import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface SeasonStanding {
  rank: number;
  playerId: number;
  name: string;
  member: boolean;
  points: number;
  participation: number;
  wins: number;
  semifinals: number;
  quarterfinals: number;
}

export interface CurrentSeason {
  label: string;
  start: string;
  end: string;
  standings: SeasonStanding[];
}

export const currentSeasonKey = ['seasons', 'current'];

export function useCurrentSeason() {
  return useQuery({
    queryKey: currentSeasonKey,
    queryFn: () => api<CurrentSeason>('/seasons/current'),
  });
}
