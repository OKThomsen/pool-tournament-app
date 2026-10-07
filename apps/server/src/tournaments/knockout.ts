import {
  FEEDS_INTO,
  KNOCKOUT_STAGE,
  knockoutBracket,
  knockoutSlots,
  poolStandings,
  qualifyFromPools,
  seedQualifiers,
  UnsupportedQualificationError,
  type KnockoutMatchId,
  type KnockoutSize,
  type Score,
  type StandingRow,
} from '@franks/core';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { knockoutSeeds, matches, tournaments } from '../db/schema.js';
import type { TournamentDetail } from './detail.js';

/** Each pool's standings, with the admin's order for ties results can't break. */
export function standingsByPool(detail: TournamentDetail): StandingRow[][] {
  return detail.pools.map((pool) => {
    const results = detail.matches
      .filter((m) => m.poolId === pool.id && m.framesA !== null && m.framesB !== null)
      .map((m) => ({
        playerA: String(m.playerAId),
        playerB: String(m.playerBId),
        framesA: m.framesA!,
        framesB: m.framesB!,
      }));
    return poolStandings(pool.playerIds.map(String), results, pool.tiebreak.map(String));
  });
}

/** Which pool each player came from, for keeping same-pool players apart in the quarterfinals. */
function poolOf(detail: TournamentDetail) {
  const pools = new Map<string, string>();
  for (const pool of detail.pools)
    for (const id of pool.playerIds) pools.set(String(id), pool.name);
  return (player: string) => pools.get(player) ?? '';
}

export type StartKnockoutResult =
  { ok: true } | { ok: false; status: 400 | 409; error: string; ties?: number[][] };

/**
 * "complete qualifier brackets": picks the qualifiers, seeds them (wins, set score, then at
 * random), creates the knockout matches and moves the tournament to the knockout.
 *
 * @param adminOrder The admin's order for players tied across pools at the qualification cut-off.
 */
export async function startKnockout(
  db: Executor,
  detail: TournamentDetail,
  size: KnockoutSize,
  raceTo: number,
  adminOrder: number[],
): Promise<StartKnockoutResult> {
  if (detail.status !== 'pools') return { ok: false, status: 409, error: 'not_in_pools' };
  const poolMatches = detail.matches.filter((m) => m.stage === 'pool');
  if (poolMatches.some((m) => m.framesA === null)) {
    return { ok: false, status: 409, error: 'pools_incomplete' };
  }

  let qualification;
  try {
    qualification = qualifyFromPools(standingsByPool(detail), size, adminOrder.map(String));
  } catch (error) {
    if (error instanceof UnsupportedQualificationError) {
      return { ok: false, status: 400, error: 'cannot_qualify' };
    }
    throw error;
  }
  if (qualification.unresolved.length > 0) {
    const ties = qualification.unresolved.map((group) => group.map(Number));
    return { ok: false, status: 409, error: 'unresolved_ties', ties };
  }

  const seeds = seedQualifiers(qualification.qualifiers);
  const bracket = knockoutBracket(seeds, {}, poolOf(detail));
  await db.insert(knockoutSeeds).values(
    seeds.map((playerId, index) => ({
      tournamentId: detail.id,
      seed: index + 1,
      playerId: Number(playerId),
    })),
  );
  await db.insert(matches).values(
    knockoutSlots(size).map((slot) => {
      const match = bracket.find((m) => m.id === slot)!;
      return {
        tournamentId: detail.id,
        stage: KNOCKOUT_STAGE[slot],
        slot,
        playerAId: match.playerA === null ? null : Number(match.playerA),
        playerBId: match.playerB === null ? null : Number(match.playerB),
        raceTo,
      };
    }),
  );
  await db
    .update(tournaments)
    .set({ status: 'knockout', knockoutSize: size })
    .where(eq(tournaments.id, detail.id));
  return { ok: true };
}

/**
 * Whether a knockout result may change. Changing who wins (or clearing the result) would change
 * who plays a later match, so that's refused while a later match it feeds has a result; clear
 * that one first. Fixing the score with the same winner is always allowed.
 */
export function knockoutChangeAllowed(
  detail: TournamentDetail,
  matchId: number,
  next: { framesA: number; framesB: number } | null,
): boolean {
  const match = detail.matches.find((m) => m.id === matchId)!;
  if (match.framesA === null || match.framesB === null) return true;
  const winner = (a: number, b: number) => (a > b ? match.playerAId : match.playerBId);
  const sameWinner =
    next !== null && winner(next.framesA, next.framesB) === winner(match.framesA, match.framesB);
  if (sameWinner) return true;
  const later = FEEDS_INTO[match.slot as KnockoutMatchId];
  return !detail.matches.some(
    (m) => later.includes(m.slot as KnockoutMatchId) && m.framesA !== null,
  );
}

/** Fills in the later knockout matches' players from the results so far. */
export async function syncBracket(db: Executor, detail: TournamentDetail): Promise<void> {
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, detail.id), isNotNull(matches.slot)));
  const scores: Partial<Record<KnockoutMatchId, Score>> = {};
  for (const row of rows) {
    if (row.framesA !== null && row.framesB !== null) {
      scores[row.slot as KnockoutMatchId] = {
        framesA: row.framesA,
        framesB: row.framesB,
        raceTo: row.raceTo,
      };
    }
  }
  const bracket = knockoutBracket(detail.seeds.map(String), scores, poolOf(detail));
  for (const row of rows) {
    const match = bracket.find((m) => m.id === row.slot)!;
    const playerAId = match.playerA === null ? null : Number(match.playerA);
    const playerBId = match.playerB === null ? null : Number(match.playerB);
    if (playerAId !== row.playerAId || playerBId !== row.playerBId) {
      await db.update(matches).set({ playerAId, playerBId }).where(eq(matches.id, row.id));
    }
  }
}
