import { shuffle } from './random.js';
import type { PlayerId, Rng } from './types.js';

export const MIN_POOL_SIZE = 4;
export const MAX_POOL_SIZE = 5;

/** Player counts that can't be split into pools of 4–5, and how the club splits them instead. */
const SPECIAL_SPLITS: Record<number, number[]> = {
  6: [6], // one pool, everyone plays everyone
  7: [4, 3],
  11: [4, 4, 3],
};

/**
 * The default pool sizes: pools of 4–5, using as few pools as possible (20 players → four pools
 * of 5, not five of 4), except for the counts in SPECIAL_SPLITS. The admin can still move
 * players between pools afterwards. Returns null below 4 players.
 */
export function poolSizes(playerCount: number): number[] | null {
  const special = SPECIAL_SPLITS[playerCount];
  if (special) return [...special];
  if (playerCount < MIN_POOL_SIZE) return null;
  for (let large = Math.floor(playerCount / MAX_POOL_SIZE); large >= 0; large--) {
    const rest = playerCount - large * MAX_POOL_SIZE;
    if (rest % MIN_POOL_SIZE === 0) {
      return [
        ...Array<number>(large).fill(MAX_POOL_SIZE),
        ...Array<number>(rest / MIN_POOL_SIZE).fill(MIN_POOL_SIZE),
      ];
    }
  }
  return null;
}

/** Fills pools of the given sizes at random. */
export function drawPools(
  players: readonly PlayerId[],
  sizes: readonly number[],
  rng: Rng = Math.random,
): PlayerId[][] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total !== players.length) {
    throw new RangeError(`Pool sizes add up to ${total}, but there are ${players.length} players`);
  }
  const shuffled = shuffle(players, rng);
  let start = 0;
  return sizes.map((size) => shuffled.slice(start, (start += size)));
}

/** Swaps two players, in the same pool or different pools. Returns new pools. */
export function swapPlayers(
  pools: readonly (readonly PlayerId[])[],
  first: PlayerId,
  second: PlayerId,
): PlayerId[][] {
  const result = pools.map((pool) => [...pool]);
  const locate = (player: PlayerId): [number, number] => {
    for (let p = 0; p < result.length; p++) {
      const i = result[p]!.indexOf(player);
      if (i !== -1) return [p, i];
    }
    throw new Error(`Player ${player} is not in any pool`);
  };
  const [p1, i1] = locate(first);
  const [p2, i2] = locate(second);
  result[p1]![i1] = second;
  result[p2]![i2] = first;
  return result;
}

/** Smallest pool the admin can leave behind when moving players around. */
export const MIN_PLAYERS_PER_POOL = 2;

/** Moves a player to the end of another pool, changing both pools' sizes. Returns new pools. */
export function movePlayer(
  pools: readonly (readonly PlayerId[])[],
  player: PlayerId,
  toPool: number,
): PlayerId[][] {
  const from = pools.findIndex((pool) => pool.includes(player));
  if (from === -1) throw new Error(`Player ${player} is not in any pool`);
  if (!pools[toPool]) throw new RangeError(`There is no pool ${toPool}`);
  if (from === toPool) return pools.map((pool) => [...pool]);
  if (pools[from]!.length <= MIN_PLAYERS_PER_POOL) {
    throw new RangeError(`A pool needs at least ${MIN_PLAYERS_PER_POOL} players`);
  }
  return pools.map((pool, i) => {
    if (i === from) return pool.filter((p) => p !== player);
    if (i === toPool) return [...pool, player];
    return [...pool];
  });
}
