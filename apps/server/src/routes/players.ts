import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database } from '../db/client.js';
import { players, results, tournamentPlayers, tournaments } from '../db/schema.js';

const handicap = { type: 'integer', minimum: -20, maximum: 20 } as const;
const name = { type: 'string', minLength: 1, maxLength: 60, pattern: '\\S' } as const;
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface PlayerBody {
  name: string;
  baseHandicap?: number;
  frameHandicap?: number;
}

/** Today's date in Denmark as YYYY-MM-DD, whatever time zone the server runs in. */
function todayInDenmark(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date());
}

/** Postgres' unique-violation error code. */
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
}

const playerColumns = {
  id: players.id,
  name: players.name,
  baseHandicap: players.baseHandicap,
  frameHandicap: players.frameHandicap,
  lastAdjusted: players.lastAdjusted,
};

export const playerRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /**
   * Every player with all-time statistics from concluded tournaments. Wins = tournaments won,
   * semifinals = reached the semifinals, quarterfinals = played in a quarterfinal.
   */
  app.get('/players', async () => {
    return db
      .select({
        ...playerColumns,
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
        .select(playerColumns)
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
      const [player] = await db
        .select(playerColumns)
        .from(players)
        .where(eq(players.id, request.params.id));
      return player ?? reply.code(404).send({ error: 'not_found' });
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
          properties: { name, baseHandicap: handicap, frameHandicap: handicap },
        },
      },
    },
    async (request, reply) => {
      const { name, baseHandicap = 0, frameHandicap = 0 } = request.body;
      try {
        const [player] = await db
          .insert(players)
          .values({ name: name.trim(), baseHandicap, frameHandicap })
          .returning(playerColumns);
        return reply.code(201).send(player);
      } catch (error) {
        if (isUniqueViolation(error)) return reply.code(409).send({ error: 'name_taken' });
        throw error;
      }
    },
  );

  /** Edits a player. Changing a handicap also sets the last adjusted date to today. */
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
          properties: { name, baseHandicap: handicap, frameHandicap: handicap },
        },
      },
    },
    async (request, reply) => {
      const [current] = await db.select().from(players).where(eq(players.id, request.params.id));
      if (!current) return reply.code(404).send({ error: 'not_found' });

      const { name, baseHandicap, frameHandicap } = request.body;
      const handicapChanged =
        (baseHandicap !== undefined && baseHandicap !== current.baseHandicap) ||
        (frameHandicap !== undefined && frameHandicap !== current.frameHandicap);
      try {
        const [player] = await db
          .update(players)
          .set({
            ...(name !== undefined && { name: name.trim() }),
            ...(baseHandicap !== undefined && { baseHandicap }),
            ...(frameHandicap !== undefined && { frameHandicap }),
            ...(handicapChanged && { lastAdjusted: todayInDenmark() }),
          })
          .where(eq(players.id, current.id))
          .returning(playerColumns);
        return player;
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
