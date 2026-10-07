import type { BracketMatch } from './knockout.js';
import type { PlayerId } from './types.js';

export type Placement = '1st' | '2nd' | '3rd' | '4th' | '5-8' | 'participation';

export type PointsTable = Record<Placement, number>;

/** From the workbook's Points System sheet. The app keeps the live table in the database. */
export const DEFAULT_POINTS_TABLE: PointsTable = {
  '1st': 10,
  '2nd': 7,
  '3rd': 5,
  '4th': 4,
  '5-8': 2,
  participation: 1,
};

/**
 * Each player's single placement in a finished tournament. Quarterfinal losers share 5–8, and
 * everyone knocked out in the pools gets participation.
 */
export function placements(
  players: readonly PlayerId[],
  bracket: readonly BracketMatch[],
): Map<PlayerId, Placement> {
  const byId = new Map(bracket.map((match) => [match.id, match]));
  const final = byId.get('FINAL');
  const third = byId.get('THIRD');
  if (!final?.winner || !final.loser || !third?.winner || !third.loser) {
    throw new Error('The final and the third-place final must be played first');
  }

  const result = new Map<PlayerId, Placement>(players.map((p) => [p, 'participation']));
  for (const match of bracket) {
    if (match.id.startsWith('QF') && match.loser) result.set(match.loser, '5-8');
  }
  result.set(final.winner, '1st');
  result.set(final.loser, '2nd');
  result.set(third.winner, '3rd');
  result.set(third.loser, '4th');
  return result;
}

export function pointsFor(placement: Placement, table: PointsTable = DEFAULT_POINTS_TABLE): number {
  return table[placement];
}
