import { MEMBER_BONUS, seasonForDate, todayInDenmark, type Season } from '@franks/core';
import { eq, getTableName, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Executor } from './client.js';
import { memberships, results, seasons, tournaments } from './schema.js';

/** The season today falls in, in Danish time. */
export function currentSeason(): Season {
  return seasonForDate(todayInDenmark());
}

/** The id of the season with this label, creating its row the first time it's needed. */
export async function seasonId(db: Executor, label: string): Promise<number> {
  const [inserted] = await db
    .insert(seasons)
    .values({ label })
    .onConflictDoNothing()
    .returning({ id: seasons.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.label, label));
  return existing!.id;
}

/**
 * `"table"."column"`. Drizzle leaves column names unqualified in single-table queries, so inside
 * a hand-written subquery an outer `"id"` would silently mean the subquery's own `id`.
 */
export function qualified(column: AnyPgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/** Whether the player renewed their membership for the season. */
export function isMemberIn(label: string, playerId: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from ${memberships}
    join ${seasons} on ${qualified(seasons.id)} = ${qualified(memberships.seasonId)}
    where ${qualified(memberships.playerId)} = ${qualified(playerId)}
      and ${qualified(seasons.label)} = ${label}
  )`;
}

/** Points from the season's concluded tournaments, plus the member bonus. */
export function seasonPointsIn(label: string, playerId: AnyPgColumn): SQL<number> {
  return sql<number>`(
    coalesce((
      select sum(${qualified(results.points)}) from ${results}
      join ${tournaments} on ${qualified(tournaments.id)} = ${qualified(results.tournamentId)}
      join ${seasons} on ${qualified(seasons.id)} = ${qualified(tournaments.seasonId)}
      where ${qualified(results.playerId)} = ${qualified(playerId)}
        and ${qualified(seasons.label)} = ${label}
    ), 0)
    + case when ${isMemberIn(label, playerId)} then ${MEMBER_BONUS} else 0 end
  )::int`;
}

/** Records or removes the player's membership for the season. */
export async function setMembership(
  db: Executor,
  playerId: number,
  label: string,
  member: boolean,
): Promise<void> {
  const id = await seasonId(db, label);
  if (member) {
    await db.insert(memberships).values({ playerId, seasonId: id }).onConflictDoNothing();
  } else {
    await db
      .delete(memberships)
      .where(sql`${memberships.playerId} = ${playerId} and ${memberships.seasonId} = ${id}`);
  }
}
