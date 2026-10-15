import { shuffle } from './random.js';
import type { PlayerId, Rng } from './types.js';

export interface SeedCandidate {
  playerId: PlayerId;
  /** Finishing position in their pool: 1 for a pool winner, 2 for a runner-up … */
  rank: number;
  won: number;
  setScore: number;
}

/**
 * Orders qualifiers best first, like the workbook's Qualifier Seeding: by finishing position in
 * their pool (every pool winner before any runner-up), then pool wins, then set score, then at
 * random.
 */
export function seedQualifiers(
  qualifiers: readonly SeedCandidate[],
  rng: Rng = Math.random,
): PlayerId[] {
  // Shuffle, then sort stably, so players level on all three end up in random order.
  return shuffle(qualifiers, rng)
    .sort((x, y) => x.rank - y.rank || y.won - x.won || y.setScore - x.setScore)
    .map((q) => q.playerId);
}
