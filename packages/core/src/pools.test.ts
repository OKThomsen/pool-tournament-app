import { describe, expect, it } from 'vitest';
import { drawPools, poolSizes, swapPlayers } from './pools.js';
import { seededRng } from './random.js';

describe('poolSizes', () => {
  it.each([
    [5, [5]],
    [8, [4, 4]],
    [9, [5, 4]],
    [13, [5, 4, 4]],
    [16, [4, 4, 4, 4]],
    [19, [5, 5, 5, 4]],
    [20, [5, 5, 5, 5]],
  ])('splits %i players into %j', (count, expected) => {
    expect(poolSizes(count)).toEqual(expected);
  });

  it.each([3, 6, 7, 11])('has no split for %i players', (count) => {
    expect(poolSizes(count)).toBeNull();
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
