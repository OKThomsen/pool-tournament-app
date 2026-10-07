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
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  matches,
  players,
  poolMembers,
  pools,
  results,
  tournamentPlayers,
  tournaments,
} from '../db/schema.js';
import { seasonId } from '../db/seasons.js';
import type { Events } from '../events.js';
import {
  concludedTournaments,
  ongoingTournament,
  tournamentDetail,
} from '../tournaments/detail.js';
import {
  knockoutChangeAllowed,
  qualifiersUnchanged,
  startKnockout,
  syncBracket,
} from '../tournaments/knockout.js';
import { writeResults } from '../tournaments/results.js';

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
  type Scorable =
    | { match: typeof matches.$inferSelect; status: typeof tournaments.$inferSelect.status }
    | { error: 404 | 409; code: string };

  async function scorableMatch(tournamentId: number, matchId: number): Promise<Scorable> {
    const [row] = await db
      .select({ match: matches, status: tournaments.status })
      .from(matches)
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .where(and(eq(matches.id, matchId), eq(matches.tournamentId, tournamentId)));
    if (!row) return { error: 404, code: 'not_found' };
    // Pool results from the pools onward; knockout results from the knockout onward. Results in
    // a concluded tournament can still be corrected (see applyResult).
    const open =
      row.match.stage === 'pool'
        ? row.status !== 'draft'
        : row.status === 'knockout' || row.status === 'concluded';
    if (!open) return { error: 409, code: 'stage_closed' };
    if (row.match.playerAId === null || row.match.playerBId === null) {
      return { error: 409, code: 'players_not_decided' };
    }
    return { match: row.match, status: row.status };
  }

  const matchParams = {
    type: 'object',
    required: ['id', 'matchId'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      matchId: { type: 'integer', minimum: 1 },
    },
  } as const;

  /**
   * Sets (or with `next = null` clears) a result.
   *
   * - A knockout result also updates who plays the later matches, and may not change a winner
   *   that a later, already-played match depends on.
   * - A pool result after the pools have closed may not change who qualified.
   * - In a concluded tournament results can be corrected but not cleared, and placements and
   *   points are rewritten. Bigger changes need the tournament reopened.
   */
  async function applyResult(
    id: number,
    matchId: number,
    next: { framesA: number; framesB: number } | null,
    reply: FastifyReply,
  ) {
    const found = await scorableMatch(id, matchId);
    if ('error' in found) return reply.code(found.error).send({ error: found.code });
    if (next) {
      try {
        assertValidScore(next.framesA, next.framesB, found.match.raceTo);
      } catch {
        return reply.code(400).send({ error: 'invalid_score' });
      }
    }
    const knockout = found.match.stage !== 'pool';
    const concluded = found.status === 'concluded';
    const before = (await tournamentDetail(db, id))!;
    if (concluded && next === null) {
      return reply.code(409).send({ error: 'tournament_concluded' });
    }
    if (knockout && !knockoutChangeAllowed(before, matchId, next)) {
      return reply.code(409).send({ error: 'later_match_played' });
    }
    if (!knockout && found.status !== 'pools' && !qualifiersUnchanged(before, matchId, next)) {
      return reply.code(409).send({ error: 'would_change_qualification' });
    }
    await db.transaction(async (tx) => {
      await tx
        .update(matches)
        .set({
          framesA: next?.framesA ?? null,
          framesB: next?.framesB ?? null,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId));
      if (knockout) await syncBracket(tx, before);
      if (concluded) await writeResults(tx, (await tournamentDetail(tx, id))!);
    });
    events.tournamentChanged(id);
    return tournamentDetail(db, id);
  }

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
    (request, reply) => applyResult(request.params.id, request.params.matchId, request.body, reply),
  );

  /** Clears a result entered by mistake, so the match counts as not played. */
  app.delete<{ Params: { id: number; matchId: number } }>(
    '/tournaments/:id/matches/:matchId/result',
    { preHandler: requireAdmin, schema: { params: matchParams } },
    (request, reply) => applyResult(request.params.id, request.params.matchId, null, reply),
  );

  /**
   * The admin's order for players in one pool that wins, set score and head-to-head can't
   * separate. Best first. Only while the pools are being played.
   */
  app.put<{ Params: { id: number; poolId: number }; Body: { playerIds: number[] } }>(
    '/tournaments/:id/pools/:poolId/tiebreak',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'poolId'],
          properties: {
            id: { type: 'integer', minimum: 1 },
            poolId: { type: 'integer', minimum: 1 },
          },
        },
        body: {
          type: 'object',
          required: ['playerIds'],
          additionalProperties: false,
          properties: { playerIds: { ...playerIdList, minItems: 2 } },
        },
      },
    },
    async (request, reply) => {
      const { id, poolId } = request.params;
      const detail = await tournamentDetail(db, id);
      const pool = detail?.pools.find((p) => p.id === poolId);
      if (!detail || !pool) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'pools') return reply.code(409).send({ error: 'not_in_pools' });
      const { playerIds } = request.body;
      if (!playerIds.every((p) => pool.playerIds.includes(p))) {
        return reply.code(400).send({ error: 'player_not_in_pool' });
      }
      await db.transaction(async (tx) => {
        for (const [position, playerId] of playerIds.entries()) {
          await tx
            .update(poolMembers)
            .set({ adminTiebreak: position })
            .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.playerId, playerId)));
        }
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * "complete qualifier brackets": `{ size: 4 | 8, raceTo, adminOrder? }`. 409
   * `unresolved_ties` with `ties` (groups of player ids) when the admin must order players first:
   * ties inside a pool go through the tiebreak route, ties between pools in `adminOrder`.
   */
  app.post<{
    Params: { id: number };
    Body: { size: 4 | 8; raceTo: number; adminOrder?: number[] };
  }>(
    '/tournaments/:id/knockout',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['size', 'raceTo'],
          additionalProperties: false,
          properties: {
            size: { type: 'integer', enum: [4, 8] },
            raceTo: { type: 'integer', minimum: 1, maximum: 15 },
            adminOrder: playerIdList,
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      const { size, raceTo, adminOrder = [] } = request.body;
      const result = await db.transaction((tx) =>
        startKnockout(tx, detail, size, raceTo, adminOrder),
      );
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error, ties: result.ties });
      }
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /** Concluded tournaments, newest first, for the Turneringer list. */
  app.get('/tournaments', async () => concludedTournaments(db));

  /**
   * "conclude tournament": once the final and the third-place final are played, writes every
   * player's placement, points, matches won and handicap snapshot, and closes the tournament.
   */
  app.post<{ Params: { id: number } }>(
    '/tournaments/:id/conclude',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'knockout') return reply.code(409).send({ error: 'not_in_knockout' });
      const finished = ['FINAL', 'THIRD'].every((slot) =>
        detail.matches.some((m) => m.slot === slot && m.framesA !== null),
      );
      if (!finished) return reply.code(409).send({ error: 'knockout_unfinished' });

      await db.transaction(async (tx) => {
        await writeResults(tx, detail);
        await tx
          .update(tournaments)
          .set({ status: 'concluded', concludedAt: new Date() })
          .where(eq(tournaments.id, id));
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * Reopens a concluded tournament for corrections too big to make in place (like a different
   * quarterfinal winner after the semifinal was played). Its results are removed until it is
   * concluded again. Only possible when no other tournament is in progress.
   */
  app.post<{ Params: { id: number } }>(
    '/tournaments/:id/reopen',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });
      if (tournament.status !== 'concluded') {
        return reply.code(409).send({ error: 'not_concluded' });
      }
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(tournaments)
            .set({ status: 'knockout', concludedAt: null })
            .where(eq(tournaments.id, id));
          await tx.delete(results).where(eq(results.tournamentId, id));
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'tournament_in_progress' });
        }
        throw error;
      }
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );
};
