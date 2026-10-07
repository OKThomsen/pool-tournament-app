import { describe, expect, it } from 'vitest';
import { seasonForDate, todayInDenmark, weekNumber } from './seasons.js';

describe('seasonForDate', () => {
  it.each([
    ['2026-01-01', '01/2026', '2026-01-01', '2026-03-31'],
    ['2026-03-31', '01/2026', '2026-01-01', '2026-03-31'],
    ['2026-04-01', '02/2026', '2026-04-01', '2026-06-30'],
    ['2026-08-15', '03/2026', '2026-07-01', '2026-09-30'],
    ['2026-12-31', '04/2026', '2026-10-01', '2026-12-31'],
  ])('puts %s in season %s', (date, label, start, end) => {
    expect(seasonForDate(date)).toEqual({ label, start, end });
  });

  it.each(['2026-13-01', '07-10-2026', ''])('rejects %j', (date) => {
    expect(() => seasonForDate(date)).toThrow(RangeError);
  });
});

describe('todayInDenmark', () => {
  it('uses Danish time, not UTC', () => {
    // 23:30 UTC on 31 March is already 1 April in Denmark (summer time, UTC+2).
    expect(todayInDenmark(new Date('2026-03-31T23:30:00Z'))).toBe('2026-04-01');
  });
});

describe('weekNumber', () => {
  it.each([
    ['2026-01-01', 1], // Thursday
    ['2026-04-30', 18],
    ['2026-10-07', 41],
    ['2026-12-28', 53], // 2026 has 53 weeks
    ['2027-01-03', 53], // still the last week of 2026
    ['2027-01-04', 1],
    ['2024-12-30', 1], // already week 1 of 2025
  ])('puts %s in week %i', (date, week) => {
    expect(weekNumber(date)).toBe(week);
  });

  it('rejects a non-date', () => {
    expect(() => weekNumber('nonsense')).toThrow(RangeError);
  });
});
