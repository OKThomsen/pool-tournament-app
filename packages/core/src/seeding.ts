import { shuffle } from './random.js';
import type { PlayerId, Rng } from './types.js';

export interface SeedCandidate {
  playerId: PlayerId;
  won: number;
  setScore: number;
}

/** Orders qualifiers best first: pool wins, then set score, then at random. */
export function seedQualifiers(
  qualifiers: readonly SeedCandidate[],
  rng: Rng = Math.random,
): PlayerId[] {
  // Shuffle, then sort stably, so players level on wins and set score end up in random order.
  return shuffle(qualifiers, rng)
    .sort((x, y) => y.won - x.won || y.setScore - x.setScore)
    .map((q) => q.playerId);
}
