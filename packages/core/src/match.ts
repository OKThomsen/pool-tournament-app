import type { MatchResult, PlayerId } from './types.js';

/** Frames needed to win a match unless the admin sets another race length. */
export const DEFAULT_RACE_TO = 2;

/**
 * Throws unless the score is a finished race: the winner has exactly `raceTo` frames and the
 * loser fewer. Handicaps don't change this; a frame handicap only changes how many balls a
 * player may leave on the table.
 */
export function assertValidScore(
  framesA: number,
  framesB: number,
  raceTo: number = DEFAULT_RACE_TO,
): void {
  if (!Number.isInteger(raceTo) || raceTo < 1) {
    throw new RangeError(`Race length must be a positive integer, got ${raceTo}`);
  }
  for (const frames of [framesA, framesB]) {
    if (!Number.isInteger(frames) || frames < 0) {
      throw new RangeError(`Frames must be a non-negative integer, got ${frames}`);
    }
  }
  if (Math.max(framesA, framesB) !== raceTo || Math.min(framesA, framesB) >= raceTo) {
    throw new RangeError(`${framesA}-${framesB} isn't a finished race to ${raceTo}`);
  }
}

export function winnerOf(result: MatchResult): PlayerId {
  return result.framesA > result.framesB ? result.playerA : result.playerB;
}

export function loserOf(result: MatchResult): PlayerId {
  return result.framesA > result.framesB ? result.playerB : result.playerA;
}

export function involves(result: MatchResult, player: PlayerId): boolean {
  return result.playerA === player || result.playerB === player;
}
