import { todayInDenmark } from '@franks/core';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { players, results, tournamentPlayers, tournaments } from '../db/schema.js';
import { currentSeason, isMemberIn, seasonPointsIn, setMembership } from '../db/seasons.js';

const handicap = { type: 'integer', minimum: -20, maximum: 20 } as const;
const name = { type: 'string', minLength: 1, maxLength: 60, pattern: '\\S' } as const;
const member = { type: 'boolean' } as const;
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface PlayerBody {
  name: string;
  baseHandicap?: number;
  frameHandicap?: number;
  /** Member this season. */
  member?: boolean;
}

/** Postgres' unique-violation error code. */
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
}

/** A player's own fields, plus whether they're a member this season. */
function playerColumns(seasonLabel: string) {
  return {
    id: players.id,
    name: players.name,
    baseHandicap: players.baseHandicap,
    frameHandicap: players.frameHandicap,
    lastAdjusted: players.lastAdjusted,
    member: isMemberIn(seasonLabel, players.id),
  };
}

async function findPlayer(db: Executor, id: number) {
  const [player] = await db
    .select(playerColumns(currentSeason().label))
    .from(players)
    .where(eq(players.id, id));
  return player;
}

export const playerRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /**
   * Every player with this season's points and all-time statistics from concluded tournaments.
   * Wins = tournaments won, semifinals = reached the semifinals, quarterfinals = played in one.
   */
  app.get('/players', async () => {
    const { label } = currentSeason();
    return db
      .select({
        ...playerColumns(label),
        seasonPoints: seasonPointsIn(label, players.id),
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
      .leftJoin(results, eq(results.playerId, players.id))
      .leftJoin(tournaments, eq(tournaments.id, results.tournamentId))
      .groupBy(players.id)
      .orderBy(sql`lower(${players.name})`);
  });

  /** "Tilføj spiller": players whose name starts with `q`, ignoring case. */
  app.get<{ Querystring: { q: string } }>(
    '/players/search',
    {
      preHandler: requireAdmin,
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: { q: { type: 'string', maxLength: 60 } },
        },
      },
    },
    async (request) => {
      const prefix = request.query.q.trim();
      if (!prefix) return [];
      // Escape LIKE wildcards so "%" or "_" in a name are matched literally.
      const pattern = prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + '%';
      return db
        .select(playerColumns(currentSeason().label))
        .from(players)
        .where(sql`${players.name} ilike ${pattern}`)
        .orderBy(sql`lower(${players.name})`)
        .limit(10);
    },
  );

  app.get<{ Params: { id: number } }>(
    '/players/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      return (
        (await findPlayer(db, request.params.id)) ?? reply.code(404).send({ error: 'not_found' })
      );
    },
  );

  /** "Tilføj ny spiller". */
  app.post<{ Body: PlayerBody }>(
    '/players',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name, baseHandicap: handicap, frameHandicap: handicap, member },
        },
      },
    },
    async (request, reply) => {
      const { name, baseHandicap = 0, frameHandicap = 0, member = false } = request.body;
      try {
        const player = await db.transaction(async (tx) => {
          const [{ id }] = (await tx
            .insert(players)
            .values({ name: name.trim(), baseHandicap, frameHandicap })
            .returning({ id: players.id })) as [{ id: number }];
          if (member) await setMembership(tx, id, currentSeason().label, true);
          return findPlayer(tx, id);
        });
        return reply.code(201).send(player);
      } catch (error) {
        if (isUniqueViolation(error)) return reply.code(409).send({ error: 'name_taken' });
        throw error;
      }
    },
  );

  /**
   * Edits a player. Changing a handicap also sets the last adjusted date to today, and `member`
   * records or removes their membership for the current season.
   */
  app.patch<{ Params: { id: number }; Body: Partial<PlayerBody> }>(
    '/players/:id',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: { name, baseHandicap: handicap, frameHandicap: handicap, member },
        },
      },
    },
    async (request, reply) => {
      const [current] = await db.select().from(players).where(eq(players.id, request.params.id));
      if (!current) return reply.code(404).send({ error: 'not_found' });

      const { name, baseHandicap, frameHandicap, member } = request.body;
      const handicapChanged =
        (baseHandicap !== undefined && baseHandicap !== current.baseHandicap) ||
        (frameHandicap !== undefined && frameHandicap !== current.frameHandicap);
      const changes = {
        ...(name !== undefined && { name: name.trim() }),
        ...(baseHandicap !== undefined && { baseHandicap }),
        ...(frameHandicap !== undefined && { frameHandicap }),
        ...(handicapChanged && { lastAdjusted: todayInDenmark() }),
      };
      try {
        return await db.transaction(async (tx) => {
          if (Object.keys(changes).length > 0) {
            await tx.update(players).set(changes).where(eq(players.id, current.id));
          }
          if (member !== undefined) {
            await setMembership(tx, current.id, currentSeason().label, member);
          }
          return findPlayer(tx, current.id);
        });
      } catch (error) {
        if (isUniqueViolation(error)) return reply.code(409).send({ error: 'name_taken' });
        throw error;
      }
    },
  );

  /** Deletes a player who has never been in a tournament. Others are kept for the history. */
  app.delete<{ Params: { id: number } }>(
    '/players/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const [entered] = await db
        .select({ id: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.playerId, id))
        .limit(1);
      if (entered) return reply.code(409).send({ error: 'player_has_tournaments' });
      const deleted = await db
        .delete(players)
        .where(eq(players.id, id))
        .returning({ id: players.id });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );
};
