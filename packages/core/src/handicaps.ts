import type { Placement } from './placements.js';

/**
 * Handicap regulation. Every player has a hidden regulation score that starts at 0. Reaching a
 * final (1st or 2nd) adds 1, losing every pool match subtracts 1. A score of +2 recommends making
 * the handicap harder by one step, −2 easier; the admin applies or dismisses the recommendation,
 * the handicap never changes by itself.
 */

/** Harder lowers the handicap (+2 on the score), easier raises it (−2). */
export type Direction = 'harder' | 'easier';

/** How long a ±1 lasts after the score last changed, in calendar months. */
export const REGULATION_MONTHS = 2;

/** The handicap range of the workbook's ladder: base +3 … −4, then frame 0 … −4. */
export const BASE_MAX = 3;
export const BASE_MIN = -4;
export const FRAME_MIN = -4;

export interface Handicap {
  base: number;
  frame: number;
}

/**
 * The regulation score change from one tournament: +1 for 1st or 2nd, −1 for no pool wins, else
 * 0. `poolWins` is null when it isn't known (an old tournament entered with placings only), so
 * such a tournament can only add.
 */
export function regulationChange(placement: Placement, poolWins: number | null): -1 | 0 | 1 {
  if (placement === '1st' || placement === '2nd') return 1;
  if (poolWins === 0) return -1;
  return 0;
}

/**
 * The handicap one step harder or easier on the workbook's ladder: base +3 … −4, and below −4
 * the frame handicap 0 … −4. Easier takes the frame handicap back first. Null at the end of the
 * ladder (−4(−4) can't get harder, +3 can't get easier).
 */
export function regulatedHandicap(
  { base, frame }: Handicap,
  direction: Direction,
): Handicap | null {
  if (direction === 'harder') {
    if (base > BASE_MIN) return { base: base - 1, frame };
    if (frame > FRAME_MIN) return { base, frame: frame - 1 };
    return null;
  }
  if (frame < 0) return { base, frame: frame + 1 };
  if (base < BASE_MAX) return { base: base + 1, frame };
  return null;
}

/** YYYY-MM-DD `months` calendar months later; a day the month lacks becomes its last day. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(Math.min(day, lastDay))}`;
}

/** A tournament the player took part in that counts for regulation. */
export interface RegulationTournament {
  kind: 'tournament';
  tournamentId: number;
  /** YYYY-MM-DD */
  date: string;
  placement: Placement;
  /** Null when it isn't known (an old tournament). */
  poolWins: number | null;
}

/**
 * Something that sets the score back to 0: the admin applied or dismissed the recommendation from
 * `tournamentId`, or changed the handicap by hand ('manual', `tournamentId` null).
 */
export interface RegulationReset {
  kind: 'reset';
  reason: 'manual' | 'applied' | 'dismissed';
  tournamentId: number | null;
  /** YYYY-MM-DD */
  date: string;
}

export type RegulationEvent = RegulationTournament | RegulationReset;

export type RegulationStep =
  | (RegulationTournament & {
      change: -1 | 0 | 1;
      /** The score after the tournament; ±2 when it gave a recommendation. */
      score: number;
      recommendation: Direction | null;
    })
  | (RegulationReset & { score: 0 })
  /** A ±1 that ran out: REGULATION_MONTHS after the score last changed. */
  | { kind: 'expired'; date: string; score: 0 };

export interface Recommendation {
  /** The tournament that took the score to ±2. */
  tournamentId: number;
  date: string;
  direction: Direction;
  /** How the admin resolved it, or null while it is pending. */
  resolution: 'applied' | 'dismissed' | null;
}

export interface Regulation {
  /** The score today: −1, 0 or 1. */
  score: number;
  /** When the current ±1 runs out (YYYY-MM-DD), or null at 0. */
  expires: string | null;
  steps: RegulationStep[];
  recommendations: Recommendation[];
}

/**
 * Replays a player's history, oldest first, into their regulation score.
 *
 * A change of ±1 lasts REGULATION_MONTHS from the last change: on that date (and on any later
 * event) the score goes back to 0. When the score reaches ±2, it gives a recommendation and the
 * count starts again from 0, so results played before the admin resolves it build a new score.
 * Resolving a recommendation (applied or dismissed) and changing the handicap by hand also set
 * the score back to 0. Recommendations don't expire.
 *
 * @param events in the order they happened; when a tournament and a reset fall on the same date,
 *   the caller decides which came first
 * @param today YYYY-MM-DD; a ±1 that has run out by today is gone
 */
export function regulation(events: readonly RegulationEvent[], today: string): Regulation {
  const steps: RegulationStep[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;
  let expires: string | null = null;

  const expireBy = (date: string) => {
    if (expires !== null && date >= expires) {
      steps.push({ kind: 'expired', date: expires, score: 0 });
      score = 0;
      expires = null;
    }
  };

  for (const event of events) {
    expireBy(event.date);
    if (event.kind === 'reset') {
      score = 0;
      expires = null;
      if (event.reason !== 'manual') {
        const resolved = recommendations.find(
          (r) => r.tournamentId === event.tournamentId && r.resolution === null,
        );
        if (resolved) resolved.resolution = event.reason;
      }
      steps.push({ ...event, score: 0 });
      continue;
    }

    const change = regulationChange(event.placement, event.poolWins);
    let recommendation: Direction | null = null;
    if (change !== 0) {
      score += change;
      expires = score === 0 ? null : addMonths(event.date, REGULATION_MONTHS);
    }
    const reached = score;
    if (Math.abs(score) >= 2) {
      recommendation = score > 0 ? 'harder' : 'easier';
      recommendations.push({
        tournamentId: event.tournamentId,
        date: event.date,
        direction: recommendation,
        resolution: null,
      });
      score = 0;
      expires = null;
    }
    steps.push({ ...event, change, score: reached, recommendation });
  }
  expireBy(today);

  return { score, expires, steps, recommendations };
}
