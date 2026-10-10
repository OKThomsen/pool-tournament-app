import { describe, expect, it } from 'vitest';
import {
  earnsMemberBonus,
  joinDeadline,
  nextSeason,
  seasonForDate,
  todayInDenmark,
  weekNumber,
} from './seasons.js';

const spring = { label: '1/2026', start: '2026-01-01', end: '2026-05-31' };
const autumn = { label: '2/2026', start: '2026-09-01', end: '2026-12-31' };

describe('seasonForDate', () => {
  it.each([
    ['2026-01-01', spring],
    ['2026-05-31', spring],
    ['2026-09-01', autumn],
    ['2026-12-31', autumn],
  ])('puts %s in its season', (date, season) => {
    expect(seasonForDate(date)).toEqual(season);
  });

  it.each(['2026-06-01', '2026-07-15', '2026-08-31'])('puts %s in the off-season', (date) => {
    expect(seasonForDate(date)).toBeNull();
  });

  it.each(['2026-13-01', '07-10-2026', ''])('rejects %j', (date) => {
    expect(() => seasonForDate(date)).toThrow(RangeError);
  });
});

describe('nextSeason', () => {
  it.each([
    ['2026-06-01', autumn],
    ['2026-08-31', autumn],
    ['2026-02-10', autumn],
    ['2026-10-10', { label: '1/2027', start: '2027-01-01', end: '2027-05-31' }],
  ])('after %s comes the next season', (date, season) => {
    expect(nextSeason(date)).toEqual(season);
  });
});

describe('member bonus', () => {
  it('can be earned by joining during the first month', () => {
    expect(joinDeadline(spring)).toBe('2026-01-31');
    expect(joinDeadline(autumn)).toBe('2026-09-30');
  });

  it.each([
    ['joined before the season, still a member', '2025-11-03', null, true],
    ['joined late in the first month', '2026-01-31', null, true],
    ['joined in the second month', '2026-02-01', null, false],
    ['stayed until the last day', '2026-01-10', '2026-05-31', true],
    ['left before the season ended', '2026-01-10', '2026-05-30', false],
    ['left before the season started', '2025-09-01', '2025-12-31', false],
  ])('%s', (_, start, end, earns) => {
    expect(earnsMemberBonus({ start, end }, spring)).toBe(earns);
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
