import { describe, expect, it } from 'vitest';
import { firstRound, knockoutBracket } from './knockout.js';
import { DEFAULT_POINTS_TABLE, placements, pointsFor } from './placements.js';
import { seededRng } from './random.js';
import { seedQualifiers } from './seeding.js';

const seeds8 = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
const aWins = { framesA: 2, framesB: 0 };

describe('seedQualifiers', () => {
  it('orders by wins, then set score', () => {
    const seeds = seedQualifiers([
      { playerId: 'low', won: 1, setScore: 5 },
      { playerId: 'top', won: 3, setScore: 1 },
      { playerId: 'mid', won: 1, setScore: 6 },
    ]);
    expect(seeds).toEqual(['top', 'mid', 'low']);
  });

  it('breaks exact ties at random', () => {
    const tied = ['A', 'B', 'C', 'D'].map((playerId) => ({ playerId, won: 2, setScore: 2 }));
    const draws = new Set(
      Array.from({ length: 20 }, (_, i) => seedQualifiers(tied, seededRng(i)).join()),
    );
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe('firstRound', () => {
  // Every seed in its own pool unless a test says otherwise.
  const pools =
    (overrides: Record<string, string> = {}) =>
    (p: string) =>
      overrides[p] ?? p;

  it('uses strict seeding when no two opponents share a pool', () => {
    expect(firstRound(seeds8, pools())).toEqual({
      pairings: [
        ['S1', 'S8'],
        ['S4', 'S5'],
        ['S2', 'S7'],
        ['S3', 'S6'],
      ],
      samePoolMatches: 0,
    });
  });

  it('gives seed 1 the next weakest opponent from another pool', () => {
    const { pairings, samePoolMatches } = firstRound(seeds8, pools({ S1: 'A', S8: 'A' }));
    expect(pairings).toEqual([
      ['S1', 'S7'],
      ['S4', 'S5'],
      ['S2', 'S8'],
      ['S3', 'S6'],
    ]);
    expect(samePoolMatches).toBe(0);
  });

  it('changes as little as possible for the higher seeds', () => {
    // Only seed 4 and seed 5 clash, so seeds 1–3 keep their strict opponents where possible.
    const { pairings } = firstRound(seeds8, pools({ S4: 'A', S5: 'A' }));
    expect(pairings).toEqual([
      ['S1', 'S8'],
      ['S4', 'S6'],
      ['S2', 'S7'],
      ['S3', 'S5'],
    ]);
  });

  it('falls back to strict seeding when a clash is unavoidable', () => {
    const everyoneInA = () => 'A';
    expect(firstRound(seeds8, everyoneInA)).toEqual({
      pairings: [
        ['S1', 'S8'],
        ['S4', 'S5'],
        ['S2', 'S7'],
        ['S3', 'S6'],
      ],
      samePoolMatches: 4,
    });
  });

  it('never rearranges semifinals', () => {
    const { pairings } = firstRound(['S1', 'S2', 'S3', 'S4'], () => 'A');
    expect(pairings).toEqual([
      ['S1', 'S4'],
      ['S2', 'S3'],
    ]);
  });

  it('feeds the rearranged pairings into the bracket', () => {
    const qf1 = knockoutBracket(seeds8, {}, pools({ S1: 'A', S8: 'A' }))[0]!;
    expect([qf1.playerA, qf1.playerB]).toEqual(['S1', 'S7']);
  });
});

describe('knockoutBracket', () => {
  it('pairs best against worst: 1v8, 4v5, 2v7, 3v6', () => {
    const qf = knockoutBracket(seeds8, {}).filter((m) => m.id.startsWith('QF'));
    expect(qf.map((m) => [m.playerA, m.playerB])).toEqual([
      ['S1', 'S8'],
      ['S4', 'S5'],
      ['S2', 'S7'],
      ['S3', 'S6'],
    ]);
  });

  it('pairs 1v4 and 2v3 for semifinals only', () => {
    const [sf1, sf2] = knockoutBracket(['S1', 'S2', 'S3', 'S4'], {});
    expect([sf1!.playerA, sf1!.playerB, sf2!.playerA, sf2!.playerB]).toEqual([
      'S1',
      'S4',
      'S2',
      'S3',
    ]);
  });

  it('sends winners on and semifinal losers to the third-place final', () => {
    const bracket = knockoutBracket(seeds8, {
      QF1: aWins,
      QF2: { framesA: 1, framesB: 2 },
      QF3: aWins,
      QF4: aWins,
      SF1: aWins,
      SF2: { framesA: 0, framesB: 2 },
    });
    const byId = Object.fromEntries(bracket.map((m) => [m.id, m]));
    expect([byId.SF1!.playerA, byId.SF1!.playerB]).toEqual(['S1', 'S5']);
    expect([byId.FINAL!.playerA, byId.FINAL!.playerB]).toEqual(['S1', 'S3']);
    expect([byId.THIRD!.playerA, byId.THIRD!.playerB]).toEqual(['S5', 'S2']);
  });

  it('rejects a score for a match whose players are not decided', () => {
    expect(() => knockoutBracket(seeds8, { FINAL: aWins })).toThrow();
  });

  it('rejects a drawn score', () => {
    expect(() => knockoutBracket(seeds8, { QF1: { framesA: 1, framesB: 1 } })).toThrow();
  });

  it('checks each score against its own race length', () => {
    const longQF1 = { framesA: 3, framesB: 1, raceTo: 3 };
    expect(knockoutBracket(seeds8, { QF1: longQF1 })[0]!.winner).toBe('S1');
    expect(() => knockoutBracket(seeds8, { QF1: { framesA: 2, framesB: 1, raceTo: 3 } })).toThrow();
  });
});

describe('placements and points', () => {
  const everyone = [...seeds8, 'Out1', 'Out2'];
  const finished = knockoutBracket(seeds8, {
    QF1: aWins,
    QF2: aWins,
    QF3: aWins,
    QF4: aWins,
    SF1: aWins, // S1 beats S4
    SF2: aWins, // S2 beats S3
    THIRD: { framesA: 0, framesB: 2 }, // S3 takes third
    FINAL: { framesA: 0, framesB: 2 }, // S2 wins
  });

  it('gives every player exactly one placement', () => {
    const result = placements(everyone, finished);
    expect(Object.fromEntries(result)).toEqual({
      S2: '1st',
      S1: '2nd',
      S3: '3rd',
      S4: '4th',
      S5: '5-8',
      S6: '5-8',
      S7: '5-8',
      S8: '5-8',
      Out1: 'participation',
      Out2: 'participation',
    });
  });

  it('needs the final and third-place final first', () => {
    expect(() => placements(everyone, knockoutBracket(seeds8, {}))).toThrow();
  });

  it('uses the workbook points table', () => {
    expect(Object.values(DEFAULT_POINTS_TABLE)).toEqual([10, 7, 5, 4, 2, 1]);
    expect(pointsFor('5-8')).toBe(2);
    expect(pointsFor('1st', { ...DEFAULT_POINTS_TABLE, '1st': 12 })).toBe(12);
  });
});
