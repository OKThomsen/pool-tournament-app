import { permutations } from './ordering.js';
import type { Pairing, PlayerId } from './types.js';

export interface Round {
  matches: Pairing[];
  /** The player sitting out this round, in a pool with an odd number of players. */
  bye: PlayerId | null;
}

/**
 * Single round robin using the circle method. In a pool with an odd number of players each
 * player sits out exactly once, so nobody sits out two rounds in a row.
 */
export function roundRobinRounds(players: readonly PlayerId[]): Round[] {
  if (players.length < 2) return [];
  const slots: (PlayerId | null)[] = [...players];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;

  const rounds: Round[] = [];
  for (let r = 0; r < n - 1; r++) {
    const matches: Pairing[] = [];
    let bye: PlayerId | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i]!;
      const b = slots[n - 1 - i]!;
      if (a === null) bye = b;
      else if (b === null) bye = a;
      else matches.push({ playerA: a, playerB: b });
    }
    rounds.push({ matches, bye });
    // Keep the first slot fixed and rotate the rest one step.
    slots.splice(1, 0, slots.pop()!);
  }
  return rounds;
}

/**
 * Flattens rounds into the order matches are called, round by round. Within each round the
 * matches are ordered so that, where possible, nobody plays two matches back to back across a
 * round boundary.
 */
export function playOrder(rounds: readonly Round[]): Pairing[] {
  let best = rounds.flatMap((round) => round.matches);
  let bestCost = backToBackCount(best);

  const search = (index: number, order: Pairing[], cost: number): void => {
    if (cost >= bestCost) return;
    if (index === rounds.length) {
      best = order;
      bestCost = cost;
      return;
    }
    for (const matches of permutations(rounds[index]!.matches)) {
      const previous = order.at(-1);
      const extra = previous && matches[0] && sharesPlayer(previous, matches[0]) ? 1 : 0;
      search(index + 1, [...order, ...matches], cost + extra);
    }
  };
  search(0, [], 0);
  return best;
}

/** The next `count` matches in play order that haven't been played yet. */
export function upNext(
  order: readonly Pairing[],
  finished: readonly Pairing[],
  count = 1,
): Pairing[] {
  return order.filter((pairing) => !finished.some((f) => samePairing(f, pairing))).slice(0, count);
}

/** The opponent in a player's next unplayed match, or null if they have played all of them. */
export function nextOpponent(
  order: readonly Pairing[],
  finished: readonly Pairing[],
  player: PlayerId,
): PlayerId | null {
  const next = order.find(
    (pairing) =>
      (pairing.playerA === player || pairing.playerB === player) &&
      !finished.some((f) => samePairing(f, pairing)),
  );
  if (!next) return null;
  return next.playerA === player ? next.playerB : next.playerA;
}

/** True when both pairings are the same two players, in either order. */
export function samePairing(x: Pairing, y: Pairing): boolean {
  return (
    (x.playerA === y.playerA && x.playerB === y.playerB) ||
    (x.playerA === y.playerB && x.playerB === y.playerA)
  );
}

/** Number of places in the order where a player plays two matches in a row. */
export function backToBackCount(order: readonly Pairing[]): number {
  let count = 0;
  for (let i = 1; i < order.length; i++) {
    if (sharesPlayer(order[i - 1]!, order[i]!)) count++;
  }
  return count;
}

function sharesPlayer(x: Pairing, y: Pairing): boolean {
  return [x.playerA, x.playerB].some((p) => p === y.playerA || p === y.playerB);
}
