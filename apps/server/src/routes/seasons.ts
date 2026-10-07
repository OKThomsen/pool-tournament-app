import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/client.js';
import { players, results, seasons, tournaments } from '../db/schema.js';
import { currentSeason, isMemberIn, qualified, seasonPointsIn } from '../db/seasons.js';

export const seasonRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /**
   * The current season and its standings: everyone who played in it or is a member, by points.
   * Players level on points share a rank.
   */
  app.get('/seasons/current', async () => {
    const season = currentSeason();
    const inSeason = sql`${qualified(results.tournamentId)} in (
      select ${qualified(tournaments.id)} from ${tournaments}
      join ${seasons} on ${qualified(seasons.id)} = ${qualified(tournaments.seasonId)}
      where ${qualified(seasons.label)} = ${season.label}
    )`;
    const member = isMemberIn(season.label, players.id);
    const points = seasonPointsIn(season.label, players.id);
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
      .leftJoin(results, and(eq(results.playerId, players.id), inSeason))
      .leftJoin(tournaments, eq(tournaments.id, results.tournamentId))
      .groupBy(players.id)
      .having(sql`count(${results.playerId}) > 0 or ${member}`)
      .orderBy(sql`${points} desc`, sql`lower(${players.name})`);

    let rank = 0;
    const standings = rows.map((row, i) => {
      if (i === 0 || row.points !== rows[i - 1]!.points) rank = i + 1;
      return { rank, ...row };
    });
    return { ...season, standings };
  });
};
