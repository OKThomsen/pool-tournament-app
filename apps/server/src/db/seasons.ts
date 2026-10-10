import {
  joinDeadline,
  MEMBER_BONUS,
  seasonForDate,
  todayInDenmark,
  type Season,
} from '@franks/core';
import { and, eq, getTableName, gte, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Executor } from './client.js';
import { memberships, results, tournaments } from './schema.js';

/** The season today falls in, in Danish time, or null in the off-season. */
export function currentSeason(): Season | null {
  return seasonForDate(todayInDenmark());
}

/**
 * `"table"."column"`. Drizzle leaves column names unqualified in single-table queries, so inside
 * a hand-written subquery an outer `"id"` would silently mean the subquery's own `id`.
 */
export function qualified(column: AnyPgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/** Whether the player was a member on the date (YYYY-MM-DD, or a date column). */
export function isMemberOn(date: string | AnyPgColumn, playerId: AnyPgColumn): SQL<boolean> {
  const day = typeof date === 'string' ? sql`${date}::date` : qualified(date);
  return sql<boolean>`exists (
    select 1 from ${memberships}
    where ${qualified(memberships.playerId)} = ${qualified(playerId)}
      and ${qualified(memberships.start)} <= ${day}
      and (${qualified(memberships.end)} is null or ${qualified(memberships.end)} >= ${day})
  )`;
}

/** The first day of the player's active membership, or null if they aren't a member. */
export function memberSince(playerId: AnyPgColumn): SQL<string | null> {
  return sql<string | null>`(
    select ${qualified(memberships.start)} from ${memberships}
    where ${qualified(memberships.playerId)} = ${qualified(playerId)}
      and ${qualified(memberships.end)} is null
  )`;
}

/**
 * Whether the player earns the season's member bonus (see earnsMemberBonus in @franks/core): a
 * membership that started by the end of the season's first month and lasts to its last day.
 */
export function earnsBonusIn(season: Season, playerId: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from ${memberships}
    where ${qualified(memberships.playerId)} = ${qualified(playerId)}
      and ${qualified(memberships.start)} <= ${joinDeadline(season)}::date
      and (${qualified(memberships.end)} is null or ${qualified(memberships.end)} >= ${season.end}::date)
  )`;
}

/** Tournaments in the season: the ones whose date falls in it. */
export function inSeason(season: Season, date: AnyPgColumn = tournaments.date): SQL<boolean> {
  return sql<boolean>`${qualified(date)} between ${season.start}::date and ${season.end}::date`;
}

/** Points from the season's concluded tournaments, plus the member bonus. */
export function seasonPointsIn(season: Season, playerId: AnyPgColumn): SQL<number> {
  return sql<number>`(
    coalesce((
      select sum(${qualified(results.points)}) from ${results}
      join ${tournaments} on ${qualified(tournaments.id)} = ${qualified(results.tournamentId)}
      where ${qualified(results.playerId)} = ${qualified(playerId)}
        and ${inSeason(season)}
    ), 0)
    + case when ${earnsBonusIn(season, playerId)} then ${MEMBER_BONUS} else 0 end
  )::int`;
}

/** The day before a date, YYYY-MM-DD. */
function dayBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Makes the player a member or not, from today in Danish time.
 *
 * Becoming a member starts an active membership on `since` (default today). If the player is
 * already a member, `since` moves its start. A membership that ended the day before `since` or
 * later is joined onto the active one, so leaving and rejoining by mistake leaves no gap.
 * Leaving ends the active membership today.
 */
export async function setMembership(
  db: Executor,
  playerId: number,
  member: boolean,
  since?: string,
): Promise<void> {
  const today = todayInDenmark();
  const [active] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.playerId, playerId), isNull(memberships.end)));

  if (!member) {
    if (active) {
      await db.update(memberships).set({ end: today }).where(eq(memberships.id, active.id));
    }
    return;
  }

  let start = since ?? active?.start ?? today;
  // Ended memberships that touch or overlap the new one become part of it.
  const touching = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.playerId, playerId),
        isNotNull(memberships.end),
        gte(memberships.end, dayBefore(start)),
      ),
    );
  for (const period of touching) {
    if (period.start < start) start = period.start;
    await db.delete(memberships).where(eq(memberships.id, period.id));
  }

  if (active) {
    await db.update(memberships).set({ start }).where(eq(memberships.id, active.id));
  } else {
    await db.insert(memberships).values({ playerId, start });
  }
}
