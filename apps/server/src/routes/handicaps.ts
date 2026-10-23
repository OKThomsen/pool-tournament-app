import {
  regulatedHandicap,
  regulation,
  todayInDenmark,
  type Placement,
  type RegulationEvent,
} from '@franks/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { handicapAdjustments, players, results, tournaments } from '../db/schema.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface PlayerRow {
  id: number;
  name: string;
  baseHandicap: number;
  frameHandicap: number;
  lastAdjusted: string | null;
}

/**
 * Every counting tournament (concluded, not for fun, not a "Par turnering") the players took
 * part in, oldest first.
 */
async function loadTournaments(db: Executor, playerIds: number[]) {
  return db
    .select({
      playerId: results.playerId,
      tournamentId: tournaments.id,
      date: tournaments.date,
      concludedAt: tournaments.concludedAt,
      format: tournaments.format,
      historical: tournaments.historical,
      placement: results.placement,
      poolWins: results.matchesWon,
      baseHandicap: results.baseHandicap,
      frameHandicap: results.frameHandicap,
    })
    .from(results)
    .innerJoin(tournaments, eq(tournaments.id, results.tournamentId))
    .where(
      and(
        inArray(results.playerId, playerIds),
        eq(tournaments.status, 'concluded'),
        eq(tournaments.forFun, false),
        eq(tournaments.duo, false),
      ),
    )
    .orderBy(asc(tournaments.date), asc(tournaments.concludedAt), asc(tournaments.id));
}

async function loadAdjustments(db: Executor, playerIds: number[]) {
  return db
    .select()
    .from(handicapAdjustments)
    .where(inArray(handicapAdjustments.playerId, playerIds))
    .orderBy(asc(handicapAdjustments.date), asc(handicapAdjustments.createdAt));
}

type TournamentRow = Awaited<ReturnType<typeof loadTournaments>>[number];
type AdjustmentRow = Awaited<ReturnType<typeof loadAdjustments>>[number];

/**
 * Whether the tournament came before the adjustment: by date, and on the same date by the time
 * it was concluded (a handicap changed in the afternoon comes before that evening's tournament).
 * A score set by hand is the score at the end of its date, so it comes after that day's
 * tournaments.
 */
function tournamentFirst(t: TournamentRow, a: AdjustmentRow): boolean {
  if (t.date !== a.date) return t.date < a.date;
  if (a.kind === 'set') return true;
  return (t.concludedAt?.getTime() ?? 0) <= a.createdAt.getTime();
}

/** A player's tournaments and adjustments merged into one history, oldest first. */
function history(played: TournamentRow[], adjustments: AdjustmentRow[]) {
  const merged: ({ tournament: TournamentRow } | { adjustment: AdjustmentRow })[] = [];
  let a = 0;
  for (const tournament of played) {
    while (a < adjustments.length && !tournamentFirst(tournament, adjustments[a]!)) {
      merged.push({ adjustment: adjustments[a++]! });
    }
    merged.push({ tournament });
  }
  while (a < adjustments.length) merged.push({ adjustment: adjustments[a++]! });
  return merged;
}

function toEvent(entry: ReturnType<typeof history>[number]): RegulationEvent {
  if ('tournament' in entry) {
    const t = entry.tournament;
    return {
      kind: 'tournament',
      tournamentId: t.tournamentId,
      date: t.date,
      placement: t.placement as Placement,
      // An old tournament's pool wins aren't known (stored as 0).
      poolWins: t.historical ? null : t.poolWins,
    };
  }
  const a = entry.adjustment;
  if (a.kind === 'set') return { kind: 'set', score: a.score as -1 | 0 | 1, date: a.date };
  return { kind: 'reset', reason: a.kind, tournamentId: a.tournamentId, date: a.date };
}

/** The players' regulation, with the pending recommendations and what applying them would do. */
async function regulations(db: Executor, list: PlayerRow[]) {
  const ids = list.map((p) => p.id);
  if (ids.length === 0) return [];
  const [played, adjustments] = await Promise.all([
    loadTournaments(db, ids),
    loadAdjustments(db, ids),
  ]);
  const today = todayInDenmark();
  return list.map((player) => {
    const merged = history(
      played.filter((t) => t.playerId === player.id),
      adjustments.filter((a) => a.playerId === player.id),
    );
    const result = regulation(merged.map(toEvent), today);
    const current = { base: player.baseHandicap, frame: player.frameHandicap };
    const pending = result.recommendations
      .filter((r) => r.resolution === null)
      .map(({ tournamentId, date, direction }) => ({
        tournamentId,
        date,
        direction,
        /** The handicap after applying it, or null at the end of the ladder. */
        next: regulatedHandicap(current, direction),
      }));
    return { player, merged, result, pending };
  });
}

function summary({ player, result, pending }: Awaited<ReturnType<typeof regulations>>[number]) {
  return { ...player, score: result.score, expires: result.expires, pending };
}

const playerFields = {
  id: players.id,
  name: players.name,
  baseHandicap: players.baseHandicap,
  frameHandicap: players.frameHandicap,
  lastAdjusted: players.lastAdjusted,
};

async function findPlayer(db: Executor, id: number): Promise<PlayerRow | undefined> {
  const [player] = await db.select(playerFields).from(players).where(eq(players.id, id));
  return player;
}

/** One player's regulation with their whole history, newest first. */
async function playerDetail(db: Executor, player: PlayerRow) {
  const [entry] = await regulations(db, [player]);
  const { merged, result } = entry!;
  // `steps` has every merged entry in order, plus the expiries in between.
  let next = 0;
  const steps = result.steps.map((step) => {
    if (step.kind === 'expired') return step;
    const source = merged[next++]!;
    if ('tournament' in source) {
      const t = source.tournament;
      return {
        ...step,
        format: t.format,
        historical: t.historical,
        poolWins: t.historical ? null : t.poolWins,
        baseHandicap: t.baseHandicap,
        frameHandicap: t.frameHandicap,
      };
    }
    const a = (source as { adjustment: AdjustmentRow }).adjustment;
    if (step.kind === 'set') return step;
    return {
      ...step,
      oldBase: a.oldBase,
      oldFrame: a.oldFrame,
      newBase: a.newBase,
      newFrame: a.newFrame,
    };
  });
  return { ...summary(entry!), history: steps.reverse() };
}

/**
 * Records a handicap change made by hand on Spillere, which sets the regulation score back to 0.
 * Call it in the transaction that changes the handicap.
 */
export async function recordManualAdjustment(
  db: Executor,
  playerId: number,
  from: { baseHandicap: number; frameHandicap: number },
  to: { baseHandicap: number; frameHandicap: number },
) {
  await db.insert(handicapAdjustments).values({
    playerId,
    kind: 'manual',
    date: todayInDenmark(),
    oldBase: from.baseHandicap,
    oldFrame: from.frameHandicap,
    newBase: to.baseHandicap,
    newFrame: to.frameHandicap,
  });
}

export const handicapRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /** Every player's handicap, regulation score and pending recommendations. Admins only. */
  app.get('/handicaps', { preHandler: requireAdmin }, async () => {
    const list = await db
      .select(playerFields)
      .from(players)
      .orderBy(sql`lower(${players.name})`);
    return (await regulations(db, list)).map(summary);
  });

  app.get<{ Params: { id: number } }>(
    '/handicaps/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const player = await findPlayer(db, request.params.id);
      if (!player) return reply.code(404).send({ error: 'not_found' });
      return playerDetail(db, player);
    },
  );

  /**
   * Resolves the pending recommendation from a tournament: 'apply' moves the handicap one step on
   * the ladder, 'dismiss' leaves it. Both set the score back to 0.
   */
  app.post<{
    Params: { id: number; tournamentId: number };
    Body: { action: 'apply' | 'dismiss' };
  }>(
    '/handicaps/:id/recommendations/:tournamentId',
    {
      preHandler: requireAdmin,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'tournamentId'],
          properties: {
            id: { type: 'integer', minimum: 1 },
            tournamentId: { type: 'integer', minimum: 1 },
          },
        },
        body: {
          type: 'object',
          required: ['action'],
          additionalProperties: false,
          properties: { action: { enum: ['apply', 'dismiss'] } },
        },
      },
    },
    async (request, reply) => {
      const { id, tournamentId } = request.params;
      const { action } = request.body;
      type Outcome = { player: PlayerRow } | { error: 404 | 409; code: string };
      const outcome = await db.transaction(async (tx): Promise<Outcome> => {
        // Locks the player, so two clicks can't resolve the same recommendation twice.
        const [player] = await tx
          .select(playerFields)
          .from(players)
          .where(eq(players.id, id))
          .for('update');
        if (!player) return { error: 404, code: 'not_found' };
        const [entry] = await regulations(tx, [player]);
        const recommendation = entry!.pending.find((r) => r.tournamentId === tournamentId);
        if (!recommendation) return { error: 409, code: 'not_pending' };
        const next =
          action === 'apply'
            ? recommendation.next
            : { base: player.baseHandicap, frame: player.frameHandicap };
        if (!next) return { error: 409, code: 'handicap_at_limit' };

        const today = todayInDenmark();
        if (action === 'apply') {
          await tx
            .update(players)
            .set({ baseHandicap: next.base, frameHandicap: next.frame, lastAdjusted: today })
            .where(eq(players.id, id));
        }
        await tx.insert(handicapAdjustments).values({
          playerId: id,
          kind: action === 'apply' ? 'applied' : 'dismissed',
          tournamentId,
          date: today,
          oldBase: player.baseHandicap,
          oldFrame: player.frameHandicap,
          newBase: next.base,
          newFrame: next.frame,
        });
        return { player: (await findPlayer(tx, id))! };
      });
      if ('error' in outcome) return reply.code(outcome.error).send({ error: outcome.code });
      return playerDetail(db, outcome.player);
    },
  );

  /**
   * Sets the regulation score by hand to what it was at the end of `date` (today unless given),
   * for instance to account for old tournaments whose pool results aren't known. Tournaments
   * after that date count on top of it; the handicap and any recommendations stay as they are.
   */
  app.put<{ Params: { id: number }; Body: { score: -1 | 0 | 1; date?: string } }>(
    '/handicaps/:id/score',
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['score'],
          additionalProperties: false,
          properties: {
            score: { type: 'integer', minimum: -1, maximum: 1 },
            date: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (request, reply) => {
      const player = await findPlayer(db, request.params.id);
      if (!player) return reply.code(404).send({ error: 'not_found' });
      const today = todayInDenmark();
      const { score, date = today } = request.body;
      if (date > today) return reply.code(400).send({ error: 'date_in_future' });
      await db.insert(handicapAdjustments).values({
        playerId: player.id,
        kind: 'set',
        date,
        score,
        oldBase: player.baseHandicap,
        oldFrame: player.frameHandicap,
        newBase: player.baseHandicap,
        newFrame: player.frameHandicap,
      });
      return playerDetail(db, player);
    },
  );
};
