import { describe, expect, it } from 'vitest';
import { drawPools, movePlayer, poolSizes, swapPlayers, updatePools } from './pools.js';
import { seededRng } from './random.js';
import { roundRobinRounds } from './schedule.js';

describe('poolSizes', () => {
  it.each([
    [4, [4]],
    [5, [5]],
    [6, [6]],
    [7, [7]],
    [8, [4, 4]],
    [9, [5, 4]],
    [11, [5, 6]],
    [13, [5, 4, 4]],
    [16, [4, 4, 4, 4]],
    [19, [5, 5, 5, 4]],
    [20, [5, 5, 5, 5]],
  ])('splits %i players into %j', (count, expected) => {
    expect(poolSizes(count)).toEqual(expected);
  });

  it('has a split for every count from 4 to 20', () => {
    for (let count = 4; count <= 20; count++) {
      expect(poolSizes(count)?.reduce((sum, size) => sum + size, 0)).toBe(count);
    }
  });

  it('has no split below 4 players', () => {
    expect(poolSizes(3)).toBeNull();
  });

  it.each([[['A', 'B', 'C']], [['A', 'B', 'C', 'D', 'E', 'F', 'G']]])(
    'gives each player in an odd pool one bye, so nobody sits out twice in a row (%j)',
    (players) => {
      const rounds = roundRobinRounds(players);
      expect(rounds.map((round) => round.bye).sort()).toEqual(players);
    },
  );
});

describe('drawPools', () => {
  const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

  it('uses every player once, in pools of the given sizes', () => {
    const pools = drawPools(players, [5, 4], seededRng(1));
    expect(pools.map((pool) => pool.length)).toEqual([5, 4]);
    expect(pools.flat().sort()).toEqual(players);
  });

  it('is random', () => {
    expect(drawPools(players, [5, 4], seededRng(1))).not.toEqual(
      drawPools(players, [5, 4], seededRng(2)),
    );
  });

  it('rejects sizes that do not match the player count', () => {
    expect(() => drawPools(players, [4, 4])).toThrow();
  });
});

describe('swapPlayers', () => {
  it('swaps players between pools without changing the input', () => {
    const pools = [
      ['A', 'B'],
      ['C', 'D'],
    ];
    expect(swapPlayers(pools, 'B', 'C')).toEqual([
      ['A', 'C'],
      ['B', 'D'],
    ]);
    expect(pools[0]).toEqual(['A', 'B']);
  });
});

describe('movePlayer', () => {
  const pools = [
    ['A', 'B', 'C', 'D'],
    ['E', 'F', 'G', 'H'],
    ['I', 'J', 'K'],
  ];

  it('moves a player into another pool, changing the sizes', () => {
    expect(movePlayer(pools, 'D', 2)).toEqual([
      ['A', 'B', 'C'],
      ['E', 'F', 'G', 'H'],
      ['I', 'J', 'K', 'D'],
    ]);
    expect(pools[0]).toHaveLength(4);
  });

  it('refuses to leave a pool with fewer than 2 players', () => {
    const small = [
      ['A', 'B'],
      ['C', 'D', 'E'],
    ];
    expect(() => movePlayer(small, 'A', 1)).toThrow();
  });

  it('rejects unknown players and pools', () => {
    expect(() => movePlayer(pools, 'Z', 0)).toThrow();
    expect(() => movePlayer(pools, 'A', 5)).toThrow();
  });
});

describe('updatePools', () => {
  const pools = [
    ['A', 'B', 'C', 'D'],
    ['E', 'F', 'G', 'H'],
  ];

  it('puts newcomers into the smallest pool and keeps everyone else where they are', () => {
    expect(updatePools(pools, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])).toEqual([
      ['A', 'B', 'C', 'D', 'I'],
      ['E', 'F', 'G', 'H', 'J'],
    ]);
  });

  it('takes out players who left', () => {
    const nine = [
      ['A', 'B', 'C', 'D', 'X'],
      ['E', 'F', 'G', 'H'],
    ];
    expect(updatePools(nine, ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'X'])).toEqual([
      ['A', 'B', 'C', 'X'],
      ['E', 'F', 'G', 'H'],
    ]);
  });

  it('adds and removes in one go', () => {
    expect(updatePools(pools, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'])).toEqual([
      ['B', 'C', 'D', 'X'],
      ['E', 'F', 'G', 'H'],
    ]);
  });

  it('asks for a new draw when the player count needs another number of pools', () => {
    // 8 → 12 players is 4 + 4 + 4; 8 → 6 is one pool of 6.
    expect(updatePools(pools, [...pools.flat(), 'I', 'J', 'K', 'L'])).toBeNull();
    expect(updatePools(pools, ['A', 'B', 'C', 'E', 'F', 'G'])).toBeNull();
  });

  it('asks for a new draw when a pool would get too small', () => {
    const uneven = [
      ['A', 'B', 'C', 'D', 'E', 'F'],
      ['G', 'H'],
    ];
    // G and H leave and X comes: X would be alone in the second pool.
    expect(updatePools(uneven, ['A', 'B', 'C', 'D', 'E', 'F', 'X'])).toBeNull();
  });
});
