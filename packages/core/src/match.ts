import type { MatchResult, PlayerId } from './types.js';

/** Throws if a frame score can't be a finished match: negative, fractional or drawn. */
export function assertValidScore(framesA: number, framesB: number): void {
  for (const frames of [framesA, framesB]) {
    if (!Number.isInteger(frames) || frames < 0) {
      throw new RangeError(`Frames must be a non-negative integer, got ${frames}`);
    }
  }
  if (framesA === framesB) {
    throw new RangeError(`A match can't end level (${framesA}-${framesB})`);
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
