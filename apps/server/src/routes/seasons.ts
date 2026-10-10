import { nextSeason, todayInDenmark, type Season } from '@franks/core';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/client.js';
import { players, results, tournaments } from '../db/schema.js';
import { currentSeason, earnsBonusIn, inSeason, qualified, seasonPointsIn } from '../db/seasons.js';

/**
 * The season's standings: everyone who played in it or earns the member bonus, by points.
 * Players level on points share a rank.
 */
async function standings(db: Database, season: Season) {
  const played = sql`${qualified(results.tournamentId)} in (
    select ${qualified(tournaments.id)} from ${tournaments} where ${inSeason(season)}
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
      wins: sql<number>`(count(*) filter (where ${results.placement} = '1st'))::int`,
      semifinals: sql<number>`(count(*) filter (
        where ${results.placement} in ('1st', '2nd', '3rd', '4th')
      ))::int`,
      quarterfinals: sql<number>`(count(*) filter (
        where ${results.placement} in ('1st', '2nd', '3rd', '4th', '5-8')
          and ${tournaments.knockoutSize} = 8
      ))::int`,
    })
    .from(players)
    .leftJoin(results, and(eq(results.playerId, players.id), played))
    .leftJoin(tournaments, eq(tournaments.id, results.tournamentId))
    .groupBy(players.id)
    .having(sql`count(${results.playerId}) > 0 or ${member}`)
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
};
