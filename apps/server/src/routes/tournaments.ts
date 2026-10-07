import {
  assertValidScore,
  drawPools,
  MIN_PLAYERS_PER_POOL,
  playOrder,
  poolSizes,
  roundRobinRounds,
  seasonForDate,
  weekNumber,
} from '@franks/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  matches,
  players,
  poolMembers,
  pools,
  tournamentPlayers,
  tournaments,
} from '../db/schema.js';
import { seasonId } from '../db/seasons.js';
import type { Events } from '../events.js';
import { ongoingTournament, tournamentDetail } from '../tournaments/detail.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const playerIdList = {
  type: 'array',
  items: { type: 'integer', minimum: 1 },
  uniqueItems: true,
} as const;

/** Pool names in order: A, B, C … */
const poolName = (index: number) => String.fromCharCode(65 + index);

/** Replaces a draft tournament's pools with the given arrangement. */
async function savePools(db: Executor, tournamentId: number, arrangement: number[][]) {
  await db.delete(pools).where(eq(pools.tournamentId, tournamentId));
  for (const [index, playerIds] of arrangement.entries()) {
    const [pool] = await db
      .insert(pools)
      .values({ tournamentId, name: poolName(index) })
      .returning({ id: pools.id });
    await db
      .insert(poolMembers)
      .values(playerIds.map((playerId, position) => ({ poolId: pool!.id, playerId, position })));
  }
}

export const tournamentRoutes: FastifyPluginAsync<{ db: Database; events: Events }> = async (
  app,
  { db, events },
) => {
  /** The tournament in progress (not concluded), or null. */
  app.get('/tournaments/ongoing', async () => ({ tournament: await ongoingTournament(db) }));

  app.get<{ Params: { id: number } }>(
    '/tournaments/:id',
    { schema: { params: idParams } },
    async (request, reply) =>
      (await tournamentDetail(db, request.params.id)) ??
      reply.code(404).send({ error: 'not_found' }),
  );

  /**
   * "Færdiggør" on CreateTurnering: creates a draft tournament and draws the pools at random.
   * Only one tournament can be in progress at a time.
   */
  app.post<{
    Body: { date: string; format: '8-ball' | '9-ball' | '10-ball'; playerIds: number[] };
  }>(
    '/tournaments',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['date', 'format', 'playerIds'],
          additionalProperties: false,
          properties: {
            date: { type: 'string', format: 'date' },
            format: { type: 'string', enum: ['8-ball', '9-ball', '10-ball'] },
            playerIds: { ...playerIdList, maxItems: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const { date, format, playerIds } = request.body;
      const sizes = poolSizes(playerIds.length);
      if (!sizes) return reply.code(400).send({ error: 'too_few_players' });
      const found = await db
        .select({ id: players.id })
        .from(players)
        .where(inArray(players.id, playerIds));
      if (found.length !== playerIds.length)
        return reply.code(400).send({ error: 'unknown_player' });

      const season = seasonForDate(date);
      try {
        const id = await db.transaction(async (tx) => {
          const [tournament] = await tx
            .insert(tournaments)
            .values({
              date,
              seasonId: await seasonId(tx, season.label),
              week: weekNumber(date),
              format,
            })
            .returning({ id: tournaments.id });
          await tx
            .insert(tournamentPlayers)
            .values(playerIds.map((playerId) => ({ tournamentId: tournament!.id, playerId })));
          const drawn = drawPools(playerIds.map(String), sizes).map((pool) => pool.map(Number));
          await savePools(tx, tournament!.id, drawn);
          return tournament!.id;
        });
        events.tournamentChanged(id);
        return reply.code(201).send(await tournamentDetail(db, id));
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'tournament_in_progress' });
        }
        throw error;
      }
    },
  );

  /**
   * Saves the admin's changes to the pools (swaps, moves) before "finalize brackets". Every
   * entrant must be in exactly one pool, and each pool needs at least 2 players.
   */
  app.put<{ Params: { id: number }; Body: { pools: number[][] } }>(
    '/tournaments/:id/pools',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['pools'],
          additionalProperties: false,
          properties: {
            pools: { type: 'array', minItems: 1, maxItems: 26, items: playerIdList },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });
      if (tournament.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });

      const arrangement = request.body.pools;
      if (arrangement.some((pool) => pool.length < MIN_PLAYERS_PER_POOL)) {
        return reply.code(400).send({ error: 'pool_too_small' });
      }
      const entrants = await db
        .select({ playerId: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, id));
      const placed = arrangement.flat();
      const expected = new Set(entrants.map((e) => e.playerId));
      if (placed.length !== expected.size || !placed.every((p) => expected.has(p))) {
        return reply.code(400).send({ error: 'players_mismatch' });
      }

      await db.transaction((tx) => savePools(tx, id, arrangement));
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * "finalize brackets": locks the pools, creates every pool match in play order and starts
   * the tournament.
   */
  app.post<{ Params: { id: number } }>(
    '/tournaments/:id/start',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });

      await db.transaction(async (tx) => {
        for (const pool of detail.pools) {
          const order = playOrder(roundRobinRounds(pool.playerIds.map(String)));
          if (order.length > 0) {
            await tx.insert(matches).values(
              order.map((pairing, index) => ({
                tournamentId: id,
                stage: 'pool' as const,
                poolId: pool.id,
                playerAId: Number(pairing.playerA),
                playerBId: Number(pairing.playerB),
                scheduleOrder: index,
              })),
            );
          }
        }
        await tx
          .update(tournaments)
          .set({ status: 'pools' })
          .where(and(eq(tournaments.id, id), eq(tournaments.status, 'draft')));
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /** Cancels a tournament that hasn't been concluded. Concluded ones are history. */
  app.delete<{ Params: { id: number } }>(
    '/tournaments/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });
      if (tournament.status === 'concluded') {
        return reply.code(409).send({ error: 'tournament_concluded' });
      }
      await db.delete(tournaments).where(eq(tournaments.id, id));
      events.tournamentChanged(id);
      return reply.code(204).send();
    },
  );

  /**
   * Finds a match the admin may score right now: it belongs to the tournament, both players are
   * known, and its stage is being played (pool matches while the pools are on).
   */
  type Scorable = { match: typeof matches.$inferSelect } | { error: 404 | 409; code: string };

  async function scorableMatch(tournamentId: number, matchId: number): Promise<Scorable> {
    const [row] = await db
      .select({ match: matches, status: tournaments.status })
      .from(matches)
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .where(and(eq(matches.id, matchId), eq(matches.tournamentId, tournamentId)));
    if (!row) return { error: 404, code: 'not_found' };
    const playing = row.match.stage === 'pool' ? row.status === 'pools' : row.status === 'knockout';
    if (!playing) return { error: 409, code: 'stage_closed' };
    if (row.match.playerAId === null || row.match.playerBId === null) {
      return { error: 409, code: 'players_not_decided' };
    }
    return { match: row.match };
  }

  const matchParams = {
    type: 'object',
    required: ['id', 'matchId'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      matchId: { type: 'integer', minimum: 1 },
    },
  } as const;

  /** Enters or corrects a result. Frames are the match's player A and B, in that order. */
  app.put<{ Params: { id: number; matchId: number }; Body: { framesA: number; framesB: number } }>(
    '/tournaments/:id/matches/:matchId/result',
    {
      preHandler: requireAdmin,
      schema: {
        params: matchParams,
        body: {
          type: 'object',
          required: ['framesA', 'framesB'],
          additionalProperties: false,
          properties: {
            framesA: { type: 'integer', minimum: 0, maximum: 99 },
            framesB: { type: 'integer', minimum: 0, maximum: 99 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id, matchId } = request.params;
      const found = await scorableMatch(id, matchId);
      if ('error' in found) return reply.code(found.error).send({ error: found.code });
      const { framesA, framesB } = request.body;
      try {
        assertValidScore(framesA, framesB, found.match.raceTo);
      } catch {
        return reply.code(400).send({ error: 'invalid_score' });
      }
      await db
        .update(matches)
        .set({ framesA, framesB, updatedAt: new Date() })
        .where(eq(matches.id, matchId));
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /** Clears a result entered by mistake, so the match counts as not played. */
  app.delete<{ Params: { id: number; matchId: number } }>(
    '/tournaments/:id/matches/:matchId/result',
    { preHandler: requireAdmin, schema: { params: matchParams } },
    async (request, reply) => {
      const { id, matchId } = request.params;
      const found = await scorableMatch(id, matchId);
      if ('error' in found) return reply.code(found.error).send({ error: found.code });
      await db
        .update(matches)
        .set({ framesA: null, framesB: null, updatedAt: new Date() })
        .where(eq(matches.id, matchId));
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );
};
