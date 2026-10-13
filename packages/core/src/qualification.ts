import { breakByAdminOrder, groupByDesc } from './ordering.js';
import type { StandingRow } from './standings.js';
import type { PlayerId } from './types.js';

/**
 * Number of players going through to the knockout: quarterfinals (8), semifinals (4), or, with a
 * single pool, the final only (2).
 */
export type KnockoutSize = 2 | 4 | 8;

/** The workbook's default. The admin makes the actual choice; this is only the preselection. */
export function suggestedKnockoutSize(playerCount: number): 4 | 8 {
  return playerCount >= 14 ? 8 : 4;
}

export class UnsupportedQualificationError extends Error {
  override name = 'UnsupportedQualificationError';
}

export interface Qualification {
  /** Pool winners first, then runners-up, and so on; best first within each of those. */
  qualifiers: StandingRow[];
  /**
   * Ties the admin has to settle before the knockout can start. Each entry is one group of
   * tied players: either inside a pool (settle with `poolStandings`' admin order) or between
   * pools for the last places (settle with this function's admin order).
   */
  unresolved: PlayerId[][];
}

/**
 * Picks the knockout players by finishing position: every pool winner first, then the best
 * runners-up, then the best third places, and so on until the places are filled.
 *
 * When only some players from a finishing position fit, they're compared across pools by wins,
 * then set score. If that's still level at the cut-off, the admin chooses (`adminOrder`).
 *
 * @param pools Each pool's standings from `poolStandings`.
 */
export function qualifyFromPools(
  pools: readonly (readonly StandingRow[])[],
  size: 4 | 8,
  adminOrder: readonly PlayerId[] = [],
): Qualification {
  const playerCount = pools.reduce((sum, pool) => sum + pool.length, 0);
  if (playerCount < size) {
    throw new UnsupportedQualificationError(`${playerCount} players can't fill ${size} places`);
  }
  const ranked = pools.map((pool) => [...pool].sort((x, y) => x.rank - y.rank));

  const qualifiers: StandingRow[] = [];
  const unresolved: PlayerId[][] = [];
  let position = 0;
  let partial = false;
  while (qualifiers.length < size) {
    const tier = ranked.flatMap((pool) => pool[position] ?? []);
    const places = size - qualifiers.length;
    const ordered = groupByDesc(tier, (row) => [row.won, row.setScore]).flatMap((group) =>
      breakByAdminOrder(
        group.map((row) => row.playerId),
        adminOrder,
      ),
    );

    const taken: PlayerId[] = [];
    for (const group of ordered) {
      if (taken.length >= places) break;
      if (taken.length + group.length > places) unresolved.push(group);
      taken.push(...group);
    }
    const byId = new Map(tier.map((row) => [row.playerId, row]));
    qualifiers.push(...taken.slice(0, places).map((id) => byId.get(id)!));
    partial = tier.length > places;
    if (!partial) position++;
  }

  // A tie inside a pool matters when it decides which finishing position a player gets.
  const outcome = (index: number) =>
    index < position ? 'in' : index === position && partial ? 'compared' : 'out';
  for (const pool of ranked) {
    for (const tied of groupByDesc(pool, (row) => [-row.rank])) {
      if (tied.length < 2 || !tied[0]!.unresolvedTie) continue;
      const outcomes = new Set(tied.map((row) => outcome(pool.indexOf(row))));
      if (outcomes.size > 1) unresolved.push(tied.map((row) => row.playerId));
    }
  }

  return { qualifiers, unresolved };
}

/**
 * The final only, for a tournament with a single pool: the pool's top two play the final, and
 * the pool ranking decides 3rd and 4th; everyone below gets participation.
 *
 * `unresolved` lists the ties the admin must settle first (with `poolStandings`' admin order):
 * those that decide who plays the final, who is 3rd or who is 4th.
 */
export function qualifyForFinal(pool: readonly StandingRow[]): Qualification {
  if (pool.length < 2) {
    throw new UnsupportedQualificationError(`${pool.length} players can't play a final`);
  }
  const ranked = [...pool].sort((x, y) => x.rank - y.rank);
  // What each position decides: the final (1st or 2nd), 3rd, 4th, or nothing.
  const outcome = (index: number) => (index < 2 ? 'final' : index < 4 ? index : 'rest');
  const unresolved = groupByDesc(ranked, (row) => [-row.rank])
    .filter((tied) => new Set(tied.map((row) => outcome(ranked.indexOf(row)))).size > 1)
    .map((tied) => tied.map((row) => row.playerId));
  return { qualifiers: ranked.slice(0, 2), unresolved };
}
