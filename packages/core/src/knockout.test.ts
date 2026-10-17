import { describe, expect, it } from 'vitest';
import {
  FEEDS_INTO,
  bracketFromFirstRound,
  firstRound,
  KNOCKOUT_STAGE,
  knockoutBracket,
  knockoutSlots,
  swapInFirstRound,
} from './knockout.js';
import { DEFAULT_POINTS_TABLE, placements, placementsInOrder, pointsFor } from './placements.js';
import { seededRng } from './random.js';
import { seedQualifiers } from './seeding.js';

const seeds8 = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
const aWins = { framesA: 2, framesB: 0 };

describe('seedQualifiers', () => {
  it('orders by wins, then set score, among players in the same position', () => {
    const seeds = seedQualifiers([
      { playerId: 'low', rank: 1, won: 1, setScore: 5 },
      { playerId: 'top', rank: 1, won: 3, setScore: 1 },
      { playerId: 'mid', rank: 1, won: 1, setScore: 6 },
    ]);
    expect(seeds).toEqual(['top', 'mid', 'low']);
  });

  it('puts every pool winner before any runner-up', () => {
    // The workbook's example: Mathias S (pool B's runner-up) is level with two pool winners.
    const seeds = seedQualifiers([
      { playerId: 'Mathias S', rank: 2, won: 2, setScore: 2 },
      { playerId: 'Martin J', rank: 1, won: 2, setScore: 2 },
      { playerId: 'Tobias K', rank: 1, won: 3, setScore: 3 },
      { playerId: 'Mathias', rank: 1, won: 2, setScore: 2 },
    ]);
    expect(seeds[0]).toBe('Tobias K');
    expect(seeds[3]).toBe('Mathias S');
  });

  it('breaks exact ties at random', () => {
    const tied = ['A', 'B', 'C', 'D'].map((playerId) => ({
      playerId,
      rank: 1,
      won: 2,
      setScore: 2,
    }));
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

  it('keeps semifinals 1v4 and 2v3 when no two opponents share a pool', () => {
    const { pairings } = firstRound(['S1', 'S2', 'S3', 'S4'], pools());
    expect(pairings).toEqual([
      ['S1', 'S4'],
      ['S2', 'S3'],
    ]);
  });

  it('switches the semifinals to 1v3 and 2v4 to keep a pool apart', () => {
    // The workbook's example: seeds 1 and 4 are pool B's winner and runner-up.
    const pool = pools({ S1: 'B', S2: 'A', S3: 'C', S4: 'B' });
    expect(firstRound(['S1', 'S2', 'S3', 'S4'], pool)).toEqual({
      pairings: [
        ['S1', 'S3'],
        ['S2', 'S4'],
      ],
      samePoolMatches: 0,
    });
  });

  it('keeps 1v4 and 2v3 when a same-pool semifinal is unavoidable', () => {
    const { pairings, samePoolMatches } = firstRound(['S1', 'S2', 'S3', 'S4'], () => 'A');
    expect(pairings).toEqual([
      ['S1', 'S4'],
      ['S2', 'S3'],
    ]);
    expect(samePoolMatches).toBe(2);
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

  it('takes 3rd and 4th from the pool ranking in a final-only knockout', () => {
    const final = knockoutBracket(['P1', 'P2'], { FINAL: { framesA: 0, framesB: 2 } });
    expect(final.map((m) => [m.id, m.playerA, m.playerB])).toEqual([['FINAL', 'P1', 'P2']]);
    const result = placements(['P1', 'P2', 'P3', 'P4', 'P5'], final, [
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
    ]);
    expect(Object.fromEntries(result)).toEqual({
      P2: '1st',
      P1: '2nd',
      P3: '3rd',
      P4: '4th',
      P5: 'participation',
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

describe('bracket structure', () => {
  it('lists the slots for each knockout size', () => {
    expect(knockoutSlots(8)).toEqual(['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'THIRD', 'FINAL']);
    expect(knockoutSlots(4)).toEqual(['SF1', 'SF2', 'THIRD', 'FINAL']);
    expect(knockoutSlots(2)).toEqual(['FINAL']);
  });

  it('feeds every match except the last two into a later one', () => {
    for (const id of knockoutSlots(8)) {
      const fed = FEEDS_INTO[id];
      expect(fed.length > 0).toBe(KNOCKOUT_STAGE[id] === 'QF' || KNOCKOUT_STAGE[id] === 'SF');
    }
  });
});

describe('swapInFirstRound', () => {
  const pairings: [string, string][] = [
    ['S1', 'S4'],
    ['S2', 'S3'],
  ];

  it('swaps two players in the first round', () => {
    expect(swapInFirstRound(pairings, 'S4', 'S3')).toEqual([
      ['S1', 'S3'],
      ['S2', 'S4'],
    ]);
    expect(pairings[0]).toEqual(['S1', 'S4']);
  });

  it('puts a player from outside the knockout in the place of one inside', () => {
    expect(swapInFirstRound(pairings, 'S2', 'X')).toEqual([
      ['S1', 'S4'],
      ['X', 'S3'],
    ]);
  });

  it('rejects a player who is not in the first round', () => {
    expect(() => swapInFirstRound(pairings, 'X', 'S1')).toThrow();
  });

  it('feeds the swapped pairings into the rest of the bracket', () => {
    const bracket = bracketFromFirstRound(swapInFirstRound(pairings, 'S4', 'S3'), {
      SF1: aWins,
      SF2: aWins,
    });
    expect(bracket.find((m) => m.id === 'FINAL')).toMatchObject({ playerA: 'S1', playerB: 'S2' });
    expect(bracket.find((m) => m.id === 'THIRD')).toMatchObject({ playerA: 'S3', playerB: 'S4' });
  });
});

describe('placementsInOrder (old tournaments)', () => {
  const players = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  it('fills 1st–4th and four 5–8 places with quarterfinals, then participation', () => {
    const result = placementsInOrder(players, 8);
    expect([...result.values()]).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5-8',
      '5-8',
      '5-8',
      '5-8',
      'participation',
      'participation',
    ]);
    expect(result.get('J')).toBe('participation');
  });

  it('has no 5–8 places with semifinals or the final only', () => {
    for (const size of [4, 2] as const) {
      const result = placementsInOrder(players.slice(0, 6), size);
      expect([...result.values()]).toEqual([
        '1st',
        '2nd',
        '3rd',
        '4th',
        'participation',
        'participation',
      ]);
    }
  });

  it('needs every place filled', () => {
    expect(() => placementsInOrder(players.slice(0, 7), 8)).toThrow();
    expect(() => placementsInOrder(players.slice(0, 3), 4)).toThrow();
    expect(placementsInOrder(players.slice(0, 4), 2).size).toBe(4);
  });
});
