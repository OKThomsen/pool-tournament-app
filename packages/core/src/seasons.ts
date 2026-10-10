/** Season points a player gets for being a member throughout the season. */
export const MEMBER_BONUS = 10;

export interface Season {
  /** `1/2026` (spring) or `2/2026` (autumn). */
  label: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day, YYYY-MM-DD. */
  end: string;
}

/**
 * Two seasons a year: 1 runs from January through May, 2 from September through December.
 * June–August is the off-season, when too many players are away to play every week.
 * `joinBy` is the last day a membership can start and still earn the member bonus.
 */
const SEASONS = [
  { number: 1, start: '01-01', end: '05-31', joinBy: '01-31' },
  { number: 2, start: '09-01', end: '12-31', joinBy: '09-30' },
] as const;

type SeasonDef = (typeof SEASONS)[number];

function parse(date: string): { year: number; monthDay: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`Not a date: ${date}`);
  }
  return { year: Number(match[1]), monthDay: `${match[2]}-${match[3]}` };
}

function season(year: number, def: SeasonDef): Season {
  return {
    label: `${def.number}/${year}`,
    start: `${year}-${def.start}`,
    end: `${year}-${def.end}`,
  };
}

/**
 * The season a date falls in, or null in the off-season (June–August).
 *
 * @param date YYYY-MM-DD
 */
export function seasonForDate(date: string): Season | null {
  const { year, monthDay } = parse(date);
  const def = SEASONS.find((s) => s.start <= monthDay && monthDay <= s.end);
  return def ? season(year, def) : null;
}

/** The first season that starts after the date; in the off-season, the one starting 1 September. */
export function nextSeason(date: string): Season {
  const { year, monthDay } = parse(date);
  const def = SEASONS.find((s) => s.start > monthDay);
  return def ? season(year, def) : season(year + 1, SEASONS[0]);
}

/**
 * The last day a membership can start and still earn the season's member bonus: the end of the
 * season's first month. Joining any time in January counts for season 1; joining in February
 * doesn't.
 */
export function joinDeadline(s: Season): string {
  const def = SEASONS.find((d) => s.start.endsWith(d.start))!;
  return `${s.start.slice(0, 4)}-${def.joinBy}`;
}

export interface MembershipPeriod {
  /** First day as a member, YYYY-MM-DD. */
  start: string;
  /** Last day as a member, or null while the membership is active. */
  end: string | null;
}

/**
 * Whether a membership earns the season's member bonus: it started by the end of the season's
 * first month and lasts until the season's last day. While a season is running, an active
 * membership counts; it stops counting if the membership ends before the season does.
 */
export function earnsMemberBonus(period: MembershipPeriod, s: Season): boolean {
  return period.start <= joinDeadline(s) && (period.end === null || period.end >= s.end);
}

/** Today's date in Denmark as YYYY-MM-DD, whatever time zone the code runs in. */
export function todayInDenmark(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(now);
}

/**
 * The ISO 8601 week number (1–53) of a date, as used in Danish calendars. Weeks start on Monday,
 * and week 1 is the week with the year's first Thursday.
 *
 * @param date YYYY-MM-DD
 */
export function weekNumber(date: string): number {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) throw new RangeError(`Not a date: ${date}`);
  // Move to the Thursday of the same week; its year is the week's year.
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
