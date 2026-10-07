/** Season points a player gets for being a member (renewing their membership) that season. */
export const MEMBER_BONUS = 50;

export interface Season {
  /** `01/2026` … `04/2026`: the quarter and the year. */
  label: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day, YYYY-MM-DD. */
  end: string;
}

const LAST_DAY = ['03-31', '06-30', '09-30', '12-31'];

/**
 * The season a date falls in. Seasons are calendar quarters, the same length as a membership:
 * January–March is 01, April–June 02, July–September 03, October–December 04.
 *
 * @param date YYYY-MM-DD
 */
export function seasonForDate(date: string): Season {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) throw new RangeError(`Not a date: ${date}`);
  const year = match[1]!;
  const quarter = Math.ceil(month / 3);
  const firstMonth = String(quarter * 3 - 2).padStart(2, '0');
  return {
    label: `0${quarter}/${year}`,
    start: `${year}-${firstMonth}-01`,
    end: `${year}-${LAST_DAY[quarter - 1]}`,
  };
}

/** Today's date in Denmark as YYYY-MM-DD, whatever time zone the code runs in. */
export function todayInDenmark(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(now);
}
