import { describe, expect, it } from 'vitest';
import { drawPools, movePlayer, poolSizes, swapPlayers } from './pools.js';
import { seededRng } from './random.js';
import { roundRobinRounds } from './schedule.js';

describe('poolSizes', () => {
  it.each([
    [4, [4]],
    [5, [5]],
    [6, [6]],
    [7, [4, 3]],
    [8, [4, 4]],
    [9, [5, 4]],
    [11, [4, 4, 3]],
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

  it('gives each player in a pool of 3 one bye, so nobody sits out twice in a row', () => {
    const rounds = roundRobinRounds(['A', 'B', 'C']);
    expect(rounds.map((round) => round.bye).sort()).toEqual(['A', 'B', 'C']);
  });
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
