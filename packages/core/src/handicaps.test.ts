import { describe, expect, it } from 'vitest';
import {
  addMonths,
  regulatedHandicap,
  regulation,
  regulationChange,
  type RegulationEvent,
} from './handicaps.js';
import type { Placement } from './placements.js';

let nextId = 1;
function played(date: string, placement: Placement, poolWins: number | null = 1): RegulationEvent {
  return { kind: 'tournament', tournamentId: nextId++, date, placement, poolWins };
}
const won = (date: string) => played(date, '1st', 3);
const second = (date: string) => played(date, '2nd', 2);
const noPoolWins = (date: string) => played(date, 'participation', 0);
const middling = (date: string) => played(date, '5-8', 2);

const scores = (events: RegulationEvent[], today: string) =>
  regulation(events, today).steps.map((step) => [step.kind, step.date, step.score]);

describe('regulationChange', () => {
  it.each([
    ['1st', 3, 1],
    ['2nd', 1, 1],
    ['3rd', 2, 0],
    ['participation', 1, 0],
    ['participation', 0, -1],
    // An old tournament: pool wins aren't known, so only a final counts.
    ['participation', null, 0],
    ['1st', null, 1],
  ] as const)('%s with %s pool wins gives %d', (placement, poolWins, change) => {
    expect(regulationChange(placement, poolWins)).toBe(change);
  });
});

describe('regulatedHandicap (the workbook ladder)', () => {
  it.each([
    [
      { base: 1, frame: 0 },
      { base: 0, frame: 0 },
    ],
    [
      { base: -3, frame: 0 },
      { base: -4, frame: 0 },
    ],
    [
      { base: -4, frame: 0 },
      { base: -4, frame: -1 },
    ],
    [
      { base: -4, frame: -3 },
      { base: -4, frame: -4 },
    ],
    [{ base: -4, frame: -4 }, null],
  ])('harder: %j → %j', (from, to) => {
    expect(regulatedHandicap(from, 'harder')).toEqual(to);
  });

  it.each([
    [
      { base: -4, frame: -2 },
      { base: -4, frame: -1 },
    ],
    [
      { base: -4, frame: 0 },
      { base: -3, frame: 0 },
    ],
    [
      { base: 2, frame: 0 },
      { base: 3, frame: 0 },
    ],
    [{ base: 3, frame: 0 }, null],
  ])('easier: %j → %j', (from, to) => {
    expect(regulatedHandicap(from, 'easier')).toEqual(to);
  });
});

describe('addMonths', () => {
  it.each([
    ['2026-11-04', '2027-01-04'],
    ['2026-10-21', '2026-12-21'],
    ['2026-12-31', '2027-02-28'],
    ['2027-12-31', '2028-02-29'],
  ])('%s + 2 months = %s', (from, to) => {
    expect(addMonths(from, 2)).toBe(to);
  });
});

describe('regulation', () => {
  it('starts at 0', () => {
    expect(regulation([], '2026-10-21')).toEqual({
      score: 0,
      expires: null,
      steps: [],
      recommendations: [],
    });
  });

  it('forgets a +1 two months after it, however many tournaments come in between', () => {
    // The first example: a win, then tournaments without a final or a pool of losses.
    const events = [won('2026-10-21'), middling('2026-11-04'), middling('2026-12-16')];
    expect(regulation(events, '2026-12-20')).toMatchObject({ score: 1, expires: '2026-12-21' });
    expect(regulation(events, '2026-12-21')).toMatchObject({ score: 0, expires: null });
    expect(scores(events, '2026-12-21')).toEqual([
      ['tournament', '2026-10-21', 1],
      ['tournament', '2026-11-04', 1],
      ['tournament', '2026-12-16', 1],
      ['expired', '2026-12-21', 0],
    ]);
  });

  it('counts the two months from the last change', () => {
    // The second example: +1, back to 0, then −1 on 04/11, forgotten on 04/01.
    const events = [
      second('2026-10-21'),
      noPoolWins('2026-10-28'),
      noPoolWins('2026-11-04'),
      middling('2026-11-25'),
      middling('2026-12-30'),
    ];
    expect(regulation(events, '2027-01-03')).toMatchObject({ score: -1, expires: '2027-01-04' });
    expect(scores(events, '2027-01-04')).toEqual([
      ['tournament', '2026-10-21', 1],
      ['tournament', '2026-10-28', 0],
      ['tournament', '2026-11-04', -1],
      ['tournament', '2026-11-25', -1],
      ['tournament', '2026-12-30', -1],
      ['expired', '2027-01-04', 0],
    ]);
  });

  it('forgets a ±1 before a tournament on the day it runs out', () => {
    const events = [won('2026-10-21'), won('2026-12-21')];
    const result = regulation(events, '2026-12-22');
    expect(result.score).toBe(1);
    expect(result.recommendations).toEqual([]);
    expect(scores(events, '2026-12-22')).toEqual([
      ['tournament', '2026-10-21', 1],
      ['expired', '2026-12-21', 0],
      ['tournament', '2026-12-21', 1],
    ]);
  });

  it('recommends harder at +2 and easier at −2', () => {
    const harder = regulation([won('2026-09-02'), second('2026-09-16')], '2026-09-17');
    expect(harder.recommendations).toEqual([
      expect.objectContaining({ date: '2026-09-16', direction: 'harder', resolution: null }),
    ]);
    expect(harder.steps.at(-1)).toMatchObject({ score: 2, recommendation: 'harder' });

    const easier = regulation([noPoolWins('2026-09-02'), noPoolWins('2026-09-09')], '2026-09-10');
    expect(easier.recommendations).toEqual([
      expect.objectContaining({ date: '2026-09-09', direction: 'easier' }),
    ]);
  });

  it('starts a new count while a recommendation waits for the admin', () => {
    const events = [won('2026-09-02'), won('2026-09-09'), noPoolWins('2026-09-16')];
    const result = regulation(events, '2026-09-17');
    expect(result.score).toBe(-1);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]!.resolution).toBeNull();
  });

  it('goes back to 0 when the recommendation is applied or dismissed', () => {
    const trigger = won('2026-09-09');
    const tournamentId = trigger.kind === 'tournament' ? trigger.tournamentId : 0;
    for (const reason of ['applied', 'dismissed'] as const) {
      const events: RegulationEvent[] = [
        won('2026-09-02'),
        trigger,
        noPoolWins('2026-09-16'),
        { kind: 'reset', reason, tournamentId, date: '2026-09-17' },
      ];
      const result = regulation(events, '2026-09-18');
      expect(result).toMatchObject({ score: 0, expires: null });
      expect(result.recommendations[0]!.resolution).toBe(reason);
    }
  });

  it('goes back to 0 when the handicap is changed by hand, leaving recommendations open', () => {
    const events: RegulationEvent[] = [
      won('2026-09-02'),
      won('2026-09-09'),
      won('2026-09-16'),
      { kind: 'reset', reason: 'manual', tournamentId: null, date: '2026-09-20' },
      won('2026-09-23'),
    ];
    const result = regulation(events, '2026-09-24');
    expect(result.score).toBe(1);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]!.resolution).toBeNull();
  });

  it('only counts finals in old tournaments, whose pool wins are unknown', () => {
    const events = [played('2026-09-02', 'participation', null), played('2026-09-09', '1st', null)];
    expect(regulation(events, '2026-09-10').score).toBe(1);
  });

  it('takes a score set by hand, and counts later tournaments on top of it', () => {
    const events: RegulationEvent[] = [
      won('2026-09-02'),
      { kind: 'set', score: -1, date: '2026-09-10' },
      noPoolWins('2026-09-16'),
    ];
    const result = regulation(events, '2026-09-17');
    expect(result.score).toBe(0);
    expect(result.recommendations).toEqual([
      expect.objectContaining({ date: '2026-09-16', direction: 'easier' }),
    ]);
    expect(scores(events, '2026-09-17')).toEqual([
      ['tournament', '2026-09-02', 1],
      ['set', '2026-09-10', -1],
      ['tournament', '2026-09-16', -2],
    ]);
  });

  it('forgets a ±1 set by hand two months after its date', () => {
    const events: RegulationEvent[] = [{ kind: 'set', score: 1, date: '2026-09-10' }];
    expect(regulation(events, '2026-11-09')).toMatchObject({ score: 1, expires: '2026-11-10' });
    expect(regulation(events, '2026-11-10')).toMatchObject({ score: 0, expires: null });
  });

  it('leaves recommendations open when the score is set by hand', () => {
    const events: RegulationEvent[] = [
      won('2026-09-02'),
      won('2026-09-09'),
      { kind: 'set', score: 0, date: '2026-09-10' },
    ];
    expect(regulation(events, '2026-09-11').recommendations[0]!.resolution).toBeNull();
  });
});
