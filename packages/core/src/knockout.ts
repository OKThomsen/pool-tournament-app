import { permutations } from './ordering.js';
import { assertValidScore } from './match.js';
import type { PlayerId } from './types.js';

export type KnockoutMatchId = 'QF1' | 'QF2' | 'QF3' | 'QF4' | 'SF1' | 'SF2' | 'THIRD' | 'FINAL';

export type KnockoutStage = 'QF' | 'SF' | 'THIRD' | 'FINAL';

/** The stage each bracket slot belongs to. */
export const KNOCKOUT_STAGE: Record<KnockoutMatchId, KnockoutStage> = {
  QF1: 'QF',
  QF2: 'QF',
  QF3: 'QF',
  QF4: 'QF',
  SF1: 'SF',
  SF2: 'SF',
  THIRD: 'THIRD',
  FINAL: 'FINAL',
};

/** The slots a knockout of 4 or 8 players uses, in playing order. */
export function knockoutSlots(size: 4 | 8): KnockoutMatchId[] {
  const later: KnockoutMatchId[] = ['SF1', 'SF2', 'THIRD', 'FINAL'];
  return size === 8 ? ['QF1', 'QF2', 'QF3', 'QF4', ...later] : later;
}

/** The matches whose players come from this match: its winner (and, from a semifinal, loser). */
export const FEEDS_INTO: Record<KnockoutMatchId, KnockoutMatchId[]> = {
  QF1: ['SF1'],
  QF2: ['SF1'],
  QF3: ['SF2'],
  QF4: ['SF2'],
  SF1: ['THIRD', 'FINAL'],
  SF2: ['THIRD', 'FINAL'],
  THIRD: [],
  FINAL: [],
};

export interface Score {
  framesA: number;
  framesB: number;
  /** Frames needed to win this match. Defaults to race to 2. */
  raceTo?: number;
}

export interface BracketMatch {
  id: KnockoutMatchId;
  /** Null until the earlier match that decides this player has been played. */
  playerA: PlayerId | null;
  playerB: PlayerId | null;
  score: Score | null;
  winner: PlayerId | null;
  loser: PlayerId | null;
}

/**
 * The top four seeds' places in the quarterfinals, QF1–QF4. Seeds 1 and 2 are in different
 * halves, so they can only meet in the final (the workbook's layout).
 */
const QF_TOP_SEEDS = [1, 4, 2, 3];

/** Which pool each player came from. */
export type PoolOf = (player: PlayerId) => string;

export interface FirstRound {
  /** Pairings in slot order: QF1–QF4, or SF1–SF2 for a semifinal-only knockout. */
  pairings: [PlayerId, PlayerId][];
  /** Pairings of two players from the same pool. Zero unless it can't be avoided. */
  samePoolMatches: number;
}

/**
 * First-round pairings. Best plays worst: 1v8, 4v5, 2v7, 3v6 in the quarterfinals, 1v4 and 2v3
 * in the semifinals.
 *
 * Given `poolOf`, quarterfinals avoid two players from the same pool meeting. The top four seeds
 * keep their places and seeds 5–8 are rearranged: seed 1 gets the weakest opponent possible
 * without a same-pool match, then seed 2, 3 and 4. Semifinals are never rearranged.
 */
export function firstRound(seeds: readonly PlayerId[], poolOf?: PoolOf): FirstRound {
  const seed = (n: number) => seeds[n - 1]!;
  if (seeds.length === 4) {
    return {
      pairings: [
        [seed(1), seed(4)],
        [seed(2), seed(3)],
      ],
      samePoolMatches: 0,
    };
  }
  if (seeds.length !== 8) {
    throw new RangeError(`A knockout needs 4 or 8 seeds, got ${seeds.length}`);
  }

  const samePool = (a: number, b: number) => (poolOf ? poolOf(seed(a)) === poolOf(seed(b)) : false);
  // opponents[i] is the opponent of top seed i + 1. Strict seeding is [8, 7, 6, 5].
  let best: { opponents: number[]; conflicts: number } | null = null;
  for (const opponents of permutations([8, 7, 6, 5])) {
    const conflicts = opponents.filter((opp, i) => samePool(i + 1, opp)).length;
    // Permutations come in order of preference, so only strictly fewer conflicts replace one.
    if (!best || conflicts < best.conflicts) best = { opponents, conflicts };
  }
  const { opponents, conflicts } = best!;
  return {
    pairings: QF_TOP_SEEDS.map((top) => [seed(top), seed(opponents[top - 1]!)]),
    samePoolMatches: conflicts,
  };
}

/**
 * Works out the whole knockout from the seeds (best first) and the scores entered so far.
 * Pass `poolOf` to keep players from the same pool apart in the quarterfinals.
 * Semifinal winners meet in the final; semifinal losers meet in the third-place final.
 */
export function knockoutBracket(
  seeds: readonly PlayerId[],
  scores: Partial<Record<KnockoutMatchId, Score>>,
  poolOf?: PoolOf,
): BracketMatch[] {
  const bracket: BracketMatch[] = [];
  const add = (id: KnockoutMatchId, playerA: PlayerId | null, playerB: PlayerId | null) => {
    const match = decide(id, playerA, playerB, scores[id]);
    bracket.push(match);
    return match;
  };
  const { pairings } = firstRound(seeds, poolOf);

  let sf1: BracketMatch;
  let sf2: BracketMatch;
  if (seeds.length === 8) {
    const qf = (['QF1', 'QF2', 'QF3', 'QF4'] as const).map((id, i) => add(id, ...pairings[i]!));
    sf1 = add('SF1', qf[0]!.winner, qf[1]!.winner);
    sf2 = add('SF2', qf[2]!.winner, qf[3]!.winner);
  } else {
    sf1 = add('SF1', ...pairings[0]!);
    sf2 = add('SF2', ...pairings[1]!);
  }
  add('THIRD', sf1.loser, sf2.loser);
  add('FINAL', sf1.winner, sf2.winner);
  return bracket;
}

function decide(
  id: KnockoutMatchId,
  playerA: PlayerId | null,
  playerB: PlayerId | null,
  score: Score | undefined,
): BracketMatch {
  if (!score) return { id, playerA, playerB, score: null, winner: null, loser: null };
  if (playerA === null || playerB === null) {
    throw new Error(`${id} has a score but its players aren't decided yet`);
  }
  assertValidScore(score.framesA, score.framesB, score.raceTo);
  const aWins = score.framesA > score.framesB;
  return {
    id,
    playerA,
    playerB,
    score,
    winner: aWins ? playerA : playerB,
    loser: aWins ? playerB : playerA,
  };
}
