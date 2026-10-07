import { assertValidScore } from './match.js';
import type { PlayerId } from './types.js';

export type KnockoutMatchId = 'QF1' | 'QF2' | 'QF3' | 'QF4' | 'SF1' | 'SF2' | 'THIRD' | 'FINAL';

export interface Score {
  framesA: number;
  framesB: number;
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
 * Seed numbers (1 = best) meeting in the first round. Best plays worst, and the top two seeds
 * are in different halves so they can only meet in the final (the workbook's layout).
 */
const FIRST_ROUND: Record<4 | 8, [number, number][]> = {
  8: [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ],
  4: [
    [1, 4],
    [2, 3],
  ],
};

/**
 * Works out the whole knockout from the seeds (best first) and the scores entered so far.
 * Semifinal winners meet in the final; semifinal losers meet in the third-place final.
 */
export function knockoutBracket(
  seeds: readonly PlayerId[],
  scores: Partial<Record<KnockoutMatchId, Score>>,
): BracketMatch[] {
  if (seeds.length !== 4 && seeds.length !== 8) {
    throw new RangeError(`A knockout needs 4 or 8 seeds, got ${seeds.length}`);
  }
  const bracket: BracketMatch[] = [];
  const add = (id: KnockoutMatchId, playerA: PlayerId | null, playerB: PlayerId | null) => {
    const match = decide(id, playerA, playerB, scores[id]);
    bracket.push(match);
    return match;
  };
  const firstRound = FIRST_ROUND[seeds.length].map(
    ([a, b]) => [seeds[a - 1]!, seeds[b - 1]!] as const,
  );

  let sf1: BracketMatch;
  let sf2: BracketMatch;
  if (seeds.length === 8) {
    const qf = (['QF1', 'QF2', 'QF3', 'QF4'] as const).map((id, i) => add(id, ...firstRound[i]!));
    sf1 = add('SF1', qf[0]!.winner, qf[1]!.winner);
    sf2 = add('SF2', qf[2]!.winner, qf[3]!.winner);
  } else {
    sf1 = add('SF1', ...firstRound[0]!);
    sf2 = add('SF2', ...firstRound[1]!);
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
  assertValidScore(score.framesA, score.framesB);
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
