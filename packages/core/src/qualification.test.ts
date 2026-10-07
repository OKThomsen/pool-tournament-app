import { describe, expect, it } from 'vitest';
import { groupA, groupB, groupC } from './fixtures.test-data.js';
import {
  qualifyFromPools,
  suggestedKnockoutSize,
  UnsupportedQualificationError,
} from './qualification.js';
import { poolStandings, type StandingRow } from './standings.js';

// Group A: Kasper 3 wins (+4), Christian 2 (+2), Prasad 1 (-2), Sarah Liv 0
// Group B: Ankush 3 (+5), Ann 1 (-1), Martin J. 1 (-2), Kent 1 (-2)
// Group C: Jacky 3 (+5), Martin E. 2 (+1), Tobias 1 (-1), Mads 0
const pools = [groupA, groupB, groupC].map((g) => poolStandings(g.players, g.results));
const ids = (rows: StandingRow[]) => rows.map((row) => row.playerId);

function row(playerId: string, rank: number, unresolvedTie = false): StandingRow {
  return {
    playerId,
    rank,
    unresolvedTie,
    played: 0,
    won: 0,
    lost: 0,
    framesFor: 0,
    framesAgainst: 0,
    setScore: 0,
  };
}

describe('qualifyFromPools', () => {
  it('takes every pool winner, then the best runner-up', () => {
    const { qualifiers, unresolved } = qualifyFromPools(pools, 4);
    // Runners-up: Christian (2 wins, +2) beats Martin E. (2, +1) and Ann (1, -1).
    expect(ids(qualifiers)).toEqual(['Ankush', 'Jacky', 'Kasper', 'Christian']);
    expect(unresolved).toEqual([]);
  });

  it('takes the top two from each of four pools for quarterfinals', () => {
    const { qualifiers } = qualifyFromPools([...pools, pools[0]!], 8);
    expect(qualifiers).toHaveLength(8);
    expect(ids(qualifiers.slice(4))).toEqual(['Christian', 'Christian', 'Martin E.', 'Ann']);
  });

  it('goes down to third places when winners and runners-up are not enough', () => {
    // 3 winners + 3 runners-up = 6. Two of the third places go through: Tobias (1, -1) first,
    // then Prasad and Martin J. are level on 1 win and -2.
    const { qualifiers, unresolved } = qualifyFromPools(pools, 8);
    expect(ids(qualifiers).slice(0, 7)).toEqual([
      'Ankush',
      'Jacky',
      'Kasper',
      'Christian',
      'Martin E.',
      'Ann',
      'Tobias',
    ]);
    expect(unresolved).toEqual([['Prasad', 'Martin J.']]);
  });

  it("settles a tie between pools in the admin's order", () => {
    const { qualifiers, unresolved } = qualifyFromPools(pools, 8, ['Martin J.', 'Prasad']);
    expect(ids(qualifiers).at(-1)).toBe('Martin J.');
    expect(unresolved).toEqual([]);
  });

  it('takes only the best winners when there are more pools than places', () => {
    const five = [...pools, pools[0]!, pools[1]!].map((pool, i) =>
      pool.map((r) => ({ ...r, playerId: `${r.playerId}${i}` })),
    );
    const { qualifiers } = qualifyFromPools(five, 4);
    expect(qualifiers.every((q) => q.rank === 1)).toBe(true);
  });

  it('reports a tie inside a pool that decides who goes through', () => {
    const pool = [row('A', 1), row('B', 2, true), row('C', 2, true), row('D', 4)];
    // Two pools, semifinals: both runners-up go through, so the B/C tie decides who that is.
    expect(qualifyFromPools([pool, pool], 4).unresolved).toEqual([
      ['B', 'C'],
      ['B', 'C'],
    ]);
  });

  it('ignores a tie inside a pool that does not matter', () => {
    const pool = [row('A', 1), row('B', 2, true), row('C', 2, true), row('D', 4)];
    // Four pools, semifinals: only the winners go through.
    expect(qualifyFromPools([pool, pool, pool, pool], 4).unresolved).toEqual([]);
  });

  it('refuses when there are fewer players than places', () => {
    expect(() => qualifyFromPools([pools[0]!], 8)).toThrow(UnsupportedQualificationError);
  });

  it('preselects quarterfinals from 14 players, like the workbook', () => {
    expect(suggestedKnockoutSize(13)).toBe(4);
    expect(suggestedKnockoutSize(14)).toBe(8);
  });
});
