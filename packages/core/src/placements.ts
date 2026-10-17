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
 *
 * A final-only knockout (one pool) has no third-place final: 3rd and 4th go to the best of the
 * rest in `poolOrder`, the pool ranking (best first).
 */
export function placements(
  players: readonly PlayerId[],
  bracket: readonly BracketMatch[],
  poolOrder: readonly PlayerId[] = [],
): Map<PlayerId, Placement> {
  const byId = new Map(bracket.map((match) => [match.id, match]));
  const final = byId.get('FINAL');
  const third = byId.get('THIRD');
  if (!final?.winner || !final.loser || (third && (!third.winner || !third.loser))) {
    throw new Error('The final and the third-place final must be played first');
  }

  const result = new Map<PlayerId, Placement>(players.map((p) => [p, 'participation']));
  for (const match of bracket) {
    if (match.id.startsWith('QF') && match.loser) result.set(match.loser, '5-8');
  }
  result.set(final.winner, '1st');
  result.set(final.loser, '2nd');
  if (third) {
    result.set(third.winner!, '3rd');
    result.set(third.loser!, '4th');
  } else {
    const [thirdPlace, fourthPlace] = poolOrder.filter(
      (p) => p !== final.winner && p !== final.loser,
    );
    if (thirdPlace) result.set(thirdPlace, '3rd');
    if (fourthPlace) result.set(fourthPlace, '4th');
  }
  return result;
}

export function pointsFor(placement: Placement, table: PointsTable = DEFAULT_POINTS_TABLE): number {
  return table[placement];
}

/** The placings an old tournament is entered with, best first, for each knockout size. */
export const ENTERED_PLACEMENTS: Record<2 | 4 | 8, readonly Placement[]> = {
  // Final only: 3rd and 4th came from the pool ranking.
  2: ['1st', '2nd', '3rd', '4th'],
  4: ['1st', '2nd', '3rd', '4th'],
  8: ['1st', '2nd', '3rd', '4th', '5-8', '5-8', '5-8', '5-8'],
};

/**
 * The placements of an old tournament entered afterwards, without its pools or matches: the
 * players come best first, filling 1st, 2nd, 3rd, 4th and, with quarterfinals, the four 5–8
 * places; everyone after that gets participation. Throws when there are too few players to fill
 * every place.
 */
export function placementsInOrder(
  players: readonly PlayerId[],
  knockoutSize: 2 | 4 | 8,
): Map<PlayerId, Placement> {
  const places = ENTERED_PLACEMENTS[knockoutSize];
  if (players.length < places.length) {
    throw new Error(`Needs at least ${places.length} players`);
  }
  return new Map(players.map((player, i) => [player, places[i] ?? 'participation']));
}
