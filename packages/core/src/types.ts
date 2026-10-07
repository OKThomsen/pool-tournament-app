export type PlayerId = string;

/** Two players meeting in a match, before or after it is played. */
export interface Pairing {
  playerA: PlayerId;
  playerB: PlayerId;
}

/** A finished match. Frames are the raw score; the player with more frames won. */
export interface MatchResult extends Pairing {
  framesA: number;
  framesB: number;
}

/** Returns a number in [0, 1), like Math.random. Injected so randomness is testable. */
export type Rng = () => number;
