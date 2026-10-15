import {
  FEEDS_INTO,
  KNOCKOUT_STAGE,
  bracketFromFirstRound,
  knockoutBracket,
  knockoutSlots,
  poolStandings,
  qualifyForFinal,
  qualifyFromPools,
  seedQualifiers,
  swapInFirstRound,
  UnsupportedQualificationError,
  type KnockoutMatchId,
  type KnockoutSize,
  type PlayerId,
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

/** Who goes through: the final only (one pool), or the semifinals or quarterfinals. */
function qualify(detail: TournamentDetail, size: KnockoutSize, adminOrder: string[]) {
  const standings = standingsByPool(detail);
  return size === 2
    ? qualifyForFinal(standings[0]!)
    : qualifyFromPools(standings, size, adminOrder);
}

/** The single pool's ranking, best first: it decides 3rd and 4th in a final-only knockout. */
export function poolOrder(detail: TournamentDetail): string[] {
  if (detail.knockoutSize !== 2) return [];
  return [...standingsByPool(detail)[0]!].sort((x, y) => x.rank - y.rank).map((r) => r.playerId);
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
  adminOrder: number[],
): Promise<StartKnockoutResult> {
  if (detail.status !== 'pools') return { ok: false, status: 409, error: 'not_in_pools' };
  const poolMatches = detail.matches.filter((m) => m.stage === 'pool');
  if (poolMatches.some((m) => m.framesA === null)) {
    return { ok: false, status: 409, error: 'pools_incomplete' };
  }
  if (size === 2 && detail.pools.length !== 1) {
    return { ok: false, status: 400, error: 'final_only_needs_one_pool' };
  }

  let qualification;
  try {
    qualification = qualify(detail, size, adminOrder.map(String));
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

  // In a final only, the pool ranking already orders the two finalists.
  const seeds =
    size === 2
      ? qualification.qualifiers.map((row) => row.playerId)
      : seedQualifiers(qualification.qualifiers);
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
        // The admin sets each round's race length before it can be played.
        raceTo: null,
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

/** A knockout match as stored: its slot, players and score. */
interface KnockoutRow {
  slot: string | null;
  playerAId: number | null;
  playerBId: number | null;
  framesA: number | null;
  framesB: number | null;
  raceTo: number | null;
}

/**
 * The knockout worked out from its stored first round (which the admin may have changed, see
 * swapFirstRound) and the results so far.
 */
function bracketOf(rows: readonly KnockoutRow[], size: KnockoutSize) {
  const firstSlots = knockoutSlots(size).slice(0, size / 2);
  const pairings = firstSlots.map((slot) => {
    const row = rows.find((r) => r.slot === slot)!;
    return [String(row.playerAId), String(row.playerBId)] as [PlayerId, PlayerId];
  });
  const scores: Partial<Record<KnockoutMatchId, Score>> = {};
  for (const row of rows) {
    if (row.slot && row.framesA !== null && row.framesB !== null) {
      scores[row.slot as KnockoutMatchId] = {
        framesA: row.framesA,
        framesB: row.framesB,
        raceTo: row.raceTo ?? undefined,
      };
    }
  }
  return bracketFromFirstRound(pairings, scores);
}

/** Fills in the later knockout matches' players from the results so far. */
export async function syncBracket(db: Executor, detail: TournamentDetail): Promise<void> {
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, detail.id), isNotNull(matches.slot)));
  const bracket = bracketOf(rows, detail.knockoutSize as KnockoutSize);
  for (const row of rows) {
    const match = bracket.find((m) => m.id === row.slot)!;
    const playerAId = match.playerA === null ? null : Number(match.playerA);
    const playerBId = match.playerB === null ? null : Number(match.playerB);
    if (playerAId !== row.playerAId || playerBId !== row.playerBId) {
      await db.update(matches).set({ playerAId, playerBId }).where(eq(matches.id, row.id));
    }
  }
}

/** The knockout as it stands, worked out from its first round and the knockout results so far. */
export function currentBracket(detail: TournamentDetail) {
  return bracketOf(detail.matches, detail.knockoutSize as KnockoutSize);
}

/**
 * Whether changing a pool result after the pools have closed keeps the same qualifiers. The
 * knockout was already drawn from them, so a correction that would change who qualified is
 * refused. Ties between pools are taken in seed order. The pool results decide this, not who is
 * in the bracket, since the admin may have brought someone else in (swapFirstRound).
 */
export function qualifiersUnchanged(
  detail: TournamentDetail,
  matchId: number,
  next: { framesA: number; framesB: number } | null,
): boolean {
  const corrected = {
    ...detail,
    matches: detail.matches.map((m) =>
      m.id === matchId
        ? { ...m, framesA: next?.framesA ?? null, framesB: next?.framesB ?? null }
        : m,
    ),
  };
  if (corrected.matches.some((m) => m.stage === 'pool' && m.framesA === null)) return false;
  const size = detail.knockoutSize as KnockoutSize;
  const seeds = detail.seeds.map(String);
  const before = qualify(detail, size, seeds);
  const after = qualify(corrected, size, seeds);
  const ids = (q: typeof before) => q.qualifiers.map((row) => row.playerId).sort();
  return after.unresolved.length === 0 && ids(after).join() === ids(before).join();
}

export type SwapResult = { ok: true } | { ok: false; status: 400 | 409; error: string };

/**
 * The admin's change to the knockout's first round: swaps two players in it, or puts a player who
 * didn't qualify in the place of one who did (taking over their seed). Only matches without a
 * result can change; clear a result first. Later rounds follow from the first.
 */
export async function swapFirstRound(
  db: Executor,
  detail: TournamentDetail,
  playerId: number,
  otherId: number,
): Promise<SwapResult> {
  if (detail.status !== 'knockout') return { ok: false, status: 409, error: 'not_in_knockout' };
  if (!detail.players.some((p) => p.id === otherId)) {
    return { ok: false, status: 400, error: 'unknown_player' };
  }
  const size = detail.knockoutSize as KnockoutSize;
  const firstSlots = knockoutSlots(size).slice(0, size / 2);
  const firstRound = firstSlots.map((slot) => detail.matches.find((m) => m.slot === slot)!);
  const pairings = firstRound.map((m) => [String(m.playerAId), String(m.playerBId)] as const);
  let swapped;
  try {
    swapped = swapInFirstRound(pairings, String(playerId), String(otherId));
  } catch {
    return { ok: false, status: 400, error: 'not_in_first_round' };
  }

  const changed = firstRound.filter(
    (m, i) => String(m.playerAId) !== swapped[i]![0] || String(m.playerBId) !== swapped[i]![1],
  );
  if (changed.some((m) => m.framesA !== null)) {
    return { ok: false, status: 409, error: 'match_played' };
  }
  for (const match of changed) {
    const [playerA, playerB] = swapped[firstRound.indexOf(match)]!;
    await db
      .update(matches)
      .set({ playerAId: Number(playerA), playerBId: Number(playerB), updatedAt: new Date() })
      .where(eq(matches.id, match.id));
  }
  // Someone from outside the knockout takes the seed of the player they replace.
  if (!detail.seeds.includes(otherId)) {
    await db
      .update(knockoutSeeds)
      .set({ playerId: otherId })
      .where(and(eq(knockoutSeeds.tournamentId, detail.id), eq(knockoutSeeds.playerId, playerId)));
  }
  await syncBracket(db, detail);
  return { ok: true };
}
