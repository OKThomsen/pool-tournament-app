import { describe, expect, it } from 'vitest';
import { groupA, groupB, groupC } from './fixtures.test-data.js';
import { poolStandings } from './standings.js';
import type { MatchResult } from './types.js';

const order = (rows: { playerId: string }[]) => rows.map((row) => row.playerId);

describe('poolStandings', () => {
  it("gives Christian the spec's 5 W - 3 L from 2-0, 2-1 and 1-2", () => {
    const christian = poolStandings(groupA.players, groupA.results).find(
      (row) => row.playerId === 'Christian',
    );
    expect(christian).toMatchObject({
      won: 2,
      lost: 1,
      framesFor: 5,
      framesAgainst: 3,
      setScore: 2,
    });
  });

  it('ranks by matches won first', () => {
    const rows = poolStandings(groupA.players, groupA.results);
    expect(order(rows)).toEqual(['Kasper', 'Christian', 'Prasad', 'Sarah Liv']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it('breaks equal wins by set score', () => {
    // Ann, Kent and Martin J. all have one win; Ann's set score (-1) is best.
    expect(order(poolStandings(groupB.players, groupB.results))[1]).toBe('Ann');
  });

  it('breaks equal wins and set score by head-to-head', () => {
    // Kent and Martin J.: one win and -2 each, and Martin J. beat Kent 2-0.
    const rows = poolStandings(groupB.players, groupB.results);
    expect(order(rows)).toEqual(['Ankush', 'Ann', 'Martin J.', 'Kent']);
    expect(rows.every((row) => !row.unresolvedTie)).toBe(true);
  });

  it('ranks group C like the workbook', () => {
    expect(order(poolStandings(groupC.players, groupC.results))).toEqual([
      'Jacky',
      'Martin E.',
      'Tobias',
      'Mads',
    ]);
  });

  it('flags a three-way cycle it cannot break', () => {
    const cycle: MatchResult[] = [
      { playerA: 'A', playerB: 'B', framesA: 2, framesB: 1 },
      { playerA: 'B', playerB: 'C', framesA: 2, framesB: 1 },
      { playerA: 'C', playerB: 'A', framesA: 2, framesB: 1 },
    ];
    const rows = poolStandings(['A', 'B', 'C'], cycle);
    expect(rows.every((row) => row.unresolvedTie && row.rank === 1)).toBe(true);
  });

  it('orders a three-way tie by the mini-league between the tied players', () => {
    // Every match ends 2-1. X, Y and Z have two wins and a set score of 0 each.
    // Among themselves X beat Y and Z, and Y beat Z.
    const won = (winner: string, loser: string): MatchResult => ({
      playerA: winner,
      playerB: loser,
      framesA: 2,
      framesB: 1,
    });
    const results = [
      won('X', 'Y'),
      won('X', 'Z'),
      won('Y', 'Z'),
      won('D', 'X'),
      won('E', 'X'),
      won('Y', 'D'),
      won('E', 'Y'),
      won('Z', 'D'),
      won('Z', 'E'),
      won('E', 'D'),
    ];
    const rows = poolStandings(['X', 'Y', 'Z', 'D', 'E'], results);
    expect(order(rows)).toEqual(['E', 'X', 'Y', 'Z', 'D']);
    expect(rows.every((row) => !row.unresolvedTie)).toBe(true);
  });

  it('leaves a tie unresolved while the deciding match is unplayed', () => {
    const rows = poolStandings(['A', 'B'], []);
    expect(rows.every((row) => row.unresolvedTie && row.rank === 1)).toBe(true);
  });

  it('rejects results for players outside the pool', () => {
    expect(() => poolStandings(['A'], groupA.results)).toThrow();
  });
});
