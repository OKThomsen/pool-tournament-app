import {
  assertValidScore,
  drawPools,
  MIN_PLAYERS_PER_POOL,
  poolSizes,
  updatePools,
  weekNumber,
} from '@franks/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { newJoinCode, replaceJoinCode } from '../auth/playerSessions.js';
import { requireAdmin, requireScorer } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  matches,
  playerSessions,
  players,
  poolMembers,
  results,
  tournamentPlayers,
  tournaments,
} from '../db/schema.js';
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
import { deletePoolMatches, poolRace, savePools, syncPoolMatches } from '../tournaments/pools.js';
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

const formats = ['8-ball', '9-ball', '10-ball'] as const;
type GameFormat = (typeof formats)[number];

/** Date, format and players: what CreateTurnering sends, and "Rediger spillere" afterwards. */
const entryBody = {
  type: 'object',
  required: ['date', 'format', 'playerIds'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', format: 'date' },
    format: { type: 'string', enum: formats },
    playerIds: { ...playerIdList, maxItems: 64 },
  },
} as const;

interface Entry {
  date: string;
  format: GameFormat;
  playerIds: number[];
}

/** Why a player list can't be used: too few players for pools, or an unknown player. */
async function entryError(db: Executor, playerIds: number[]): Promise<string | null> {
  if (!poolSizes(playerIds.length)) return 'too_few_players';
  const found = await db
    .select({ id: players.id })
    .from(players)
    .where(inArray(players.id, playerIds));
  return found.length === playerIds.length ? null : 'unknown_player';
}

/** The players, date and pools can change until the knockout starts. */
const poolsOpen = (status: string) => status === 'draft' || status === 'pools';

/** Draws every pool again at random. Results in the pools are deleted. */
async function redrawPools(db: Executor, tournamentId: number, playerIds: number[]) {
  const race = await poolRace(db, tournamentId);
  const drawn = drawPools(playerIds.map(String), poolSizes(playerIds.length)!).map((pool) =>
    pool.map(Number),
  );
  await deletePoolMatches(db, tournamentId);
  await savePools(db, tournamentId, drawn);
  if (race !== null) await syncPoolMatches(db, tournamentId, race);
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
  app.post<{ Body: Entry }>(
    '/tournaments',
    { preHandler: requireAdmin, schema: { body: entryBody } },
    async (request, reply) => {
      const { date, format, playerIds } = request.body;
      const error = await entryError(db, playerIds);
      if (error) return reply.code(400).send({ error });

      try {
        const id = await db.transaction(async (tx) => {
          const [tournament] = await tx
            .insert(tournaments)
            .values({
              date,
              week: weekNumber(date),
              format,
              joinCode: newJoinCode(),
            })
            .returning({ id: tournaments.id });
          await tx
            .insert(tournamentPlayers)
            .values(playerIds.map((playerId) => ({ tournamentId: tournament!.id, playerId })));
          await redrawPools(tx, tournament!.id, playerIds);
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
   * Saves the admin's changes to the pools (swaps, moves), until the knockout starts. Every
   * entrant must be in exactly one pool, and each pool needs at least 2 players. Once the pools
   * are being played, a result stays as long as both its players are still in that pool.
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
      if (!poolsOpen(tournament.status)) return reply.code(409).send({ error: 'pools_closed' });

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

      await db.transaction(async (tx) => {
        await savePools(tx, id, arrangement);
        const race = await poolRace(tx, id);
        if (race !== null) await syncPoolMatches(tx, id, race);
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * "Rediger spillere": changes the date, format and players until the knockout starts. Players
   * who leave are taken out of their pool with their matches, and so get no result at all.
   * Newcomers go into the smallest pool; when the new player count needs another number of
   * pools, or a pool would get too small, every pool is drawn again and the pool results go.
   */
  app.put<{ Params: { id: number }; Body: Entry }>(
    '/tournaments/:id',
    { preHandler: requireAdmin, schema: { params: idParams, body: entryBody } },
    async (request, reply) => {
      const { id } = request.params;
      const { date, format, playerIds } = request.body;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (!poolsOpen(detail.status)) return reply.code(409).send({ error: 'pools_closed' });
      const error = await entryError(db, playerIds);
      if (error) return reply.code(400).send({ error });

      const before = detail.players.map((p) => p.id);
      const leaving = before.filter((p) => !playerIds.includes(p));
      const joining = playerIds.filter((p) => !before.includes(p));
      const kept = updatePools(
        detail.pools.map((pool) => pool.playerIds.map(String)),
        playerIds.map(String),
      );
      await db.transaction(async (tx) => {
        await tx
          .update(tournaments)
          .set({ date, week: weekNumber(date), format })
          .where(eq(tournaments.id, id));
        if (leaving.length > 0) {
          await tx
            .delete(tournamentPlayers)
            .where(
              and(
                eq(tournamentPlayers.tournamentId, id),
                inArray(tournamentPlayers.playerId, leaving),
              ),
            );
        }
        if (joining.length > 0) {
          await tx
            .insert(tournamentPlayers)
            .values(joining.map((playerId) => ({ tournamentId: id, playerId })));
        }
        if (!kept) return redrawPools(tx, id, playerIds);
        await savePools(
          tx,
          id,
          kept.map((pool) => pool.map(Number)),
        );
        const race = await poolRace(tx, id);
        if (race !== null) await syncPoolMatches(tx, id, race);
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /** "Randomize": draws every pool again, until the knockout starts. Pool results are deleted. */
  app.post<{ Params: { id: number } }>(
    '/tournaments/:id/randomize',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (!poolsOpen(detail.status)) return reply.code(409).send({ error: 'pools_closed' });
      await db.transaction((tx) =>
        redrawPools(
          tx,
          id,
          detail.players.map((p) => p.id),
        ),
      );
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * Changes the pool matches' race length (2 to 5) while the pools are being played. Only before
   * the first pool result; clear the results to change it later.
   */
  app.put<{ Params: { id: number }; Body: { raceTo: number } }>(
    '/tournaments/:id/pools/race',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['raceTo'],
          additionalProperties: false,
          properties: { raceTo: { type: 'integer', minimum: 2, maximum: 5 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'pools') return reply.code(409).send({ error: 'not_in_pools' });
      if (detail.matches.some((m) => m.stage === 'pool' && m.framesA !== null)) {
        return reply.code(409).send({ error: 'round_started' });
      }
      await db
        .update(matches)
        .set({ raceTo: request.body.raceTo, updatedAt: new Date() })
        .where(and(eq(matches.tournamentId, id), eq(matches.stage, 'pool')));
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * "Gå til turnering": `{ raceTo }`, 2 to 5. Creates every pool match in play order with that
   * race length and starts the pools. The players and pools can still be changed afterwards.
   */
  app.post<{ Params: { id: number }; Body: { raceTo: number } }>(
    '/tournaments/:id/start',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['raceTo'],
          additionalProperties: false,
          properties: { raceTo: { type: 'integer', minimum: 2, maximum: 5 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { raceTo } = request.body;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });

      await db.transaction(async (tx) => {
        await syncPoolMatches(tx, id, raceTo);
        await tx
          .update(tournaments)
          .set({ status: 'pools' })
          .where(and(eq(tournaments.id, id), eq(tournaments.status, 'draft')));
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * The join code players enter on /play to score matches. Admin-only, and kept out of the
   * public tournament detail, since /live shows the tournament to everyone in the club.
   */
  app.get<{ Params: { id: number } }>(
    '/tournaments/:id/code',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const [tournament] = await db
        .select({ code: tournaments.joinCode })
        .from(tournaments)
        .where(eq(tournaments.id, request.params.id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });
      return { code: tournament.code };
    },
  );

  /** "Ny kode": a new join code. Everyone who joined with the old one is signed out. */
  app.post<{ Params: { id: number } }>(
    '/tournaments/:id/code',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
      if (!tournament) return reply.code(404).send({ error: 'not_found' });
      if (tournament.status === 'concluded') {
        return reply.code(409).send({ error: 'tournament_concluded' });
      }
      const code = await db.transaction((tx) => replaceJoinCode(tx, id, tournament.joinCode));
      // Open /play pages recheck their session and ask for the new code.
      events.tournamentChanged(id);
      return { code };
    },
  );

  /**
   * Deletes a tournament: cancels one in progress, or removes a concluded one from history.
   * Its pools, matches, results and player sessions go with it (foreign keys cascade). Season
   * points and player statistics are derived from `results`, so they drop it at once.
   */
  app.delete<{ Params: { id: number } }>(
    '/tournaments/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await db
        .delete(tournaments)
        .where(eq(tournaments.id, id))
        .returning({ id: tournaments.id });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      events.tournamentChanged(id);
      return reply.code(204).send();
    },
  );

  /**
   * Finds a match that may be scored right now: it belongs to the tournament, both players are
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
    const { raceTo } = found.match;
    if (raceTo === null) return reply.code(409).send({ error: 'race_not_set' });
    if (next) {
      try {
        assertValidScore(next.framesA, next.framesB, raceTo);
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

  /**
   * Enters or corrects a result. Frames are the match's player A and B, in that order. Players
   * who joined with the code may do this too.
   */
  app.put<{ Params: { id: number; matchId: number }; Body: { framesA: number; framesB: number } }>(
    '/tournaments/:id/matches/:matchId/result',
    {
      preHandler: requireScorer,
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

  /** Clears a result entered by mistake, so the match counts as not played. Players too. */
  app.delete<{ Params: { id: number; matchId: number } }>(
    '/tournaments/:id/matches/:matchId/result',
    { preHandler: requireScorer, schema: { params: matchParams } },
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
   * "complete qualifier brackets": `{ size: 2 | 4 | 8, adminOrder? }` (2: the final only, for
   * a single pool). Every round starts without
   * a race length; the admin sets it per round with the race route below. 409
   * `unresolved_ties` with `ties` (groups of player ids) when the admin must order players first:
   * ties inside a pool go through the tiebreak route, ties between pools in `adminOrder`.
   */
  app.post<{
    Params: { id: number };
    Body: { size: 2 | 4 | 8; adminOrder?: number[] };
  }>(
    '/tournaments/:id/knockout',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['size'],
          additionalProperties: false,
          properties: {
            size: { type: 'integer', enum: [2, 4, 8] },
            adminOrder: playerIdList,
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      const { size, adminOrder = [] } = request.body;
      const result = await db.transaction((tx) => startKnockout(tx, detail, size, adminOrder));
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error, ties: result.ties });
      }
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * The race length for one knockout round (QF, SF, THIRD or FINAL): chosen per round, as the
   * knockout goes on. Can be changed until the round's first result is in.
   */
  app.put<{
    Params: { id: number };
    Body: { stage: 'QF' | 'SF' | 'THIRD' | 'FINAL'; raceTo: number };
  }>(
    '/tournaments/:id/knockout/race',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['stage', 'raceTo'],
          additionalProperties: false,
          properties: {
            stage: { type: 'string', enum: ['QF', 'SF', 'THIRD', 'FINAL'] },
            raceTo: { type: 'integer', minimum: 1, maximum: 15 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { stage, raceTo } = request.body;
      const detail = await tournamentDetail(db, id);
      if (!detail) return reply.code(404).send({ error: 'not_found' });
      if (detail.status !== 'knockout') return reply.code(409).send({ error: 'not_in_knockout' });
      const round = detail.matches.filter((m) => m.stage === stage);
      if (round.length === 0) return reply.code(400).send({ error: 'no_such_round' });
      if (round.some((m) => m.framesA !== null)) {
        return reply.code(409).send({ error: 'round_started' });
      }
      await db
        .update(matches)
        .set({ raceTo, updatedAt: new Date() })
        .where(and(eq(matches.tournamentId, id), eq(matches.stage, stage)));
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /** Concluded tournaments, newest first, for the Turneringer list. */
  app.get('/tournaments', async () => concludedTournaments(db));

  /**
   * "conclude tournament": once the final and the third-place final (if any) are played, writes every
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
      const finished = detail.matches
        .filter((m) => m.slot === 'FINAL' || m.slot === 'THIRD')
        .every((m) => m.framesA !== null);
      if (!finished) return reply.code(409).send({ error: 'knockout_unfinished' });

      await db.transaction(async (tx) => {
        await writeResults(tx, detail);
        await tx
          .update(tournaments)
          // The join code retires with the tournament, and so do the players' sessions.
          .set({ status: 'concluded', concludedAt: new Date(), joinCode: null })
          .where(eq(tournaments.id, id));
        await tx.delete(playerSessions).where(eq(playerSessions.tournamentId, id));
      });
      events.tournamentChanged(id);
      return tournamentDetail(db, id);
    },
  );

  /**
   * Reopens a concluded tournament for corrections too big to make in place (like a different
   * quarterfinal winner after the semifinal was played). Its results are removed until it is
   * concluded again, and it gets a new join code. Only possible when no other tournament is in
   * progress.
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
            .set({ status: 'knockout', concludedAt: null, joinCode: newJoinCode() })
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
