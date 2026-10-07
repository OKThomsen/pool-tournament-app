import type { StandingRow } from './standings.js';
import type { PlayerId } from './types.js';

/** Number of players going through to the knockout: quarterfinals (8) or semifinals (4). */
export type KnockoutSize = 4 | 8;

/** The workbook's default. The admin makes the actual choice; this is only the preselection. */
export function suggestedKnockoutSize(playerCount: number): KnockoutSize {
  return playerCount >= 14 ? 8 : 4;
}

export class UnsupportedQualificationError extends Error {
  override name = 'UnsupportedQualificationError';
}

export interface Qualification {
  /** Pool by pool, best first within each pool. */
  qualifiers: StandingRow[];
  /** Per pool, players in an unresolved tie across the qualification cut-off. Needs a decision. */
  tiesAtCutoff: PlayerId[][];
}

/**
 * Takes the same number of players from every pool (for example the top two from each of four
 * pools for quarterfinals). Pools must already be ranked by `poolStandings`.
 *
 * Qualification when the places can't be shared evenly between the pools isn't specified yet
 * (CLAUDE.md, open questions 1 and 2), so that case throws.
 */
export function qualifyFromPools(
  pools: readonly (readonly StandingRow[])[],
  size: KnockoutSize,
): Qualification {
  if (pools.length === 0 || size % pools.length !== 0) {
    throw new UnsupportedQualificationError(
      `Can't share ${size} places evenly between ${pools.length} pools`,
    );
  }
  const perPool = size / pools.length;
  const qualifiers: StandingRow[] = [];
  const tiesAtCutoff: PlayerId[][] = [];
  for (const pool of pools) {
    if (pool.length < perPool) {
      throw new UnsupportedQualificationError(
        `A pool of ${pool.length} can't send ${perPool} players through`,
      );
    }
    const ranked = [...pool].sort((x, y) => x.rank - y.rank);
    qualifiers.push(...ranked.slice(0, perPool));
    const lastIn = ranked[perPool - 1]!;
    const firstOut = ranked[perPool];
    if (firstOut && firstOut.rank === lastIn.rank) {
      tiesAtCutoff.push(
        ranked.filter((row) => row.rank === lastIn.rank).map((row) => row.playerId),
      );
    }
  }
  return { qualifiers, tiesAtCutoff };
}
