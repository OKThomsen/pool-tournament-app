import {
  nextSeason,
  seasonByLabel,
  seasonForDate,
  todayInDenmark,
  type Season,
} from '@franks/core';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/client.js';
import { players, results, tournaments } from '../db/schema.js';
import { currentSeason, earnsBonusIn, inSeason, qualified, seasonPointsIn } from '../db/seasons.js';

/**
 * The season's standings: everyone with at least 1 point this season (from playing in it or the
 * member bonus), by points. "For sjov kamp" tournaments don't count, and a "Par turnering" only
 * counts in points and Deltagelse. Players level on points share a rank. Players with 0 points are left
 * out here but are still listed on Spillere.
 */
async function standings(db: Database, season: Season) {
  const played = sql`${qualified(results.tournamentId)} in (
    select ${qualified(tournaments.id)} from ${tournaments}
    where ${inSeason(season)} and not ${qualified(tournaments.forFun)}
  )`;
  const member = earnsBonusIn(season, players.id);
  const points = seasonPointsIn(season, players.id);
  const rows = await db
    .select({
      playerId: players.id,
      name: players.name,
      member,
      points,
      participation: sql<number>`count(${results.playerId})::int`,
      wins: sql<number>`(count(*) filter (where ${results.placement} = '1st' and not ${tournaments.duo}))::int`,
      semifinals: sql<number>`(count(*) filter (
        where ${results.placement} in ('1st', '2nd', '3rd', '4th')
        and ${tournaments.knockoutSize} <> 2 and not ${tournaments.duo}
      ))::int`,
      quarterfinals: sql<number>`(count(*) filter (
        where ${results.placement} in ('1st', '2nd', '3rd', '4th', '5-8')
          and ${tournaments.knockoutSize} = 8 and not ${tournaments.duo}
      ))::int`,
    })
    .from(players)
    .leftJoin(results, and(eq(results.playerId, players.id), played))
    .leftJoin(tournaments, eq(tournaments.id, results.tournamentId))
    .groupBy(players.id)
    .having(sql`${points} > 0`)
    .orderBy(sql`${points} desc`, sql`lower(${players.name})`);

  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.points !== rows[i - 1]!.points) rank = i + 1;
    return { rank, ...row };
  });
}

export const seasonRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /**
   * The current season and its standings. In the off-season `season` is null and the standings
   * are empty; `next` is the season after today either way.
   */
  app.get('/seasons/current', async () => {
    const season = currentSeason();
    return {
      season,
      next: nextSeason(todayInDenmark()),
      standings: season ? await standings(db, season) : [],
    };
  });

  /**
   * Every season with a concluded tournament that counts (not "For sjov kamp"), plus the
   * current one, newest first: the choices on Sæson.
   */
  app.get('/seasons', async () => {
    const dates = await db
      .selectDistinct({ date: tournaments.date })
      .from(tournaments)
      .where(and(eq(tournaments.status, 'concluded'), eq(tournaments.forFun, false)));
    const byLabel = new Map<string, Season>();
    for (const season of [currentSeason(), ...dates.map((row) => seasonForDate(row.date))]) {
      if (season) byLabel.set(season.label, season);
    }
    return [...byLabel.values()].sort((a, b) => b.start.localeCompare(a.start));
  });

  /** One season's standings, by its label with a dash: `1-2026` for 1/2026. */
  app.get<{ Params: { id: string } }>('/seasons/:id', async (request, reply) => {
    const season = seasonByLabel(request.params.id.replace('-', '/'));
    if (!season) return reply.code(404).send({ error: 'not_found' });
    return { season, standings: await standings(db, season) };
  });
};
