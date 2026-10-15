import { DEFAULT_RACE_TO, playOrder, roundRobinRounds, samePairing } from '@franks/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { matches, poolMembers, pools } from '../db/schema.js';

/** Pool names in order: A, B, C … */
const poolName = (index: number) => String.fromCharCode(65 + index);

/**
 * Saves the pools (player ids per pool, in order). The pool rows are kept, so their matches and
 * results stay; pools are added or removed at the end. A pool whose players changed loses the
 * admin's tiebreak, which only applied to the old line-up. Call syncPoolMatches afterwards once
 * the pools are being played.
 */
export async function savePools(db: Executor, tournamentId: number, arrangement: number[][]) {
  const existing = await db
    .select({ id: pools.id })
    .from(pools)
    .where(eq(pools.tournamentId, tournamentId))
    .orderBy(asc(pools.name));
  const extra = existing.slice(arrangement.length).map((pool) => pool.id);
  if (extra.length > 0) await db.delete(pools).where(inArray(pools.id, extra));

  for (const [index, playerIds] of arrangement.entries()) {
    let poolId = existing[index]?.id;
    if (poolId === undefined) {
      const [pool] = await db
        .insert(pools)
        .values({ tournamentId, name: poolName(index) })
        .returning({ id: pools.id });
      poolId = pool!.id;
    }
    const members = await db
      .select({ playerId: poolMembers.playerId, tiebreak: poolMembers.adminTiebreak })
      .from(poolMembers)
      .where(eq(poolMembers.poolId, poolId));
    const unchanged =
      members.length === playerIds.length && members.every((m) => playerIds.includes(m.playerId));
    const tiebreak = new Map(members.map((m) => [m.playerId, unchanged ? m.tiebreak : null]));
    await db.delete(poolMembers).where(eq(poolMembers.poolId, poolId));
    await db.insert(poolMembers).values(
      playerIds.map((playerId, position) => ({
        poolId,
        playerId,
        position,
        adminTiebreak: tiebreak.get(playerId) ?? null,
      })),
    );
  }
}

/** The pool matches' race length, or null before they exist (in the draft). */
export async function poolRace(db: Executor, tournamentId: number): Promise<number | null> {
  const [match] = await db
    .select({ raceTo: matches.raceTo })
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'pool')))
    .limit(1);
  return match ? (match.raceTo ?? DEFAULT_RACE_TO) : null;
}

/**
 * Makes each pool's matches fit its players: a match between two players who are both still in
 * the pool keeps its result, matches with a player who left the pool are deleted, and missing
 * pairings are added with `raceTo`. Every pool's play order is rebuilt.
 */
export async function syncPoolMatches(db: Executor, tournamentId: number, raceTo: number) {
  const members = await db
    .select({ poolId: pools.id, playerId: poolMembers.playerId })
    .from(pools)
    .innerJoin(poolMembers, eq(poolMembers.poolId, pools.id))
    .where(eq(pools.tournamentId, tournamentId))
    .orderBy(asc(pools.name), asc(poolMembers.position));
  const poolIds = [...new Set(members.map((m) => m.poolId))];

  for (const poolId of poolIds) {
    const playerIds = members.filter((m) => m.poolId === poolId).map((m) => String(m.playerId));
    const order = playOrder(roundRobinRounds(playerIds));
    const current = await db
      .select({ id: matches.id, playerAId: matches.playerAId, playerBId: matches.playerBId })
      .from(matches)
      .where(and(eq(matches.poolId, poolId), eq(matches.stage, 'pool')));
    const pairingOf = (m: (typeof current)[number]) => ({
      playerA: String(m.playerAId),
      playerB: String(m.playerBId),
    });

    for (const match of current) {
      const index = order.findIndex((pairing) => samePairing(pairing, pairingOf(match)));
      if (index === -1) await db.delete(matches).where(eq(matches.id, match.id));
      else await db.update(matches).set({ scheduleOrder: index }).where(eq(matches.id, match.id));
    }
    const missing = order
      .map((pairing, index) => ({ pairing, index }))
      .filter(({ pairing }) => !current.some((m) => samePairing(pairing, pairingOf(m))));
    if (missing.length > 0) {
      await db.insert(matches).values(
        missing.map(({ pairing, index }) => ({
          tournamentId,
          stage: 'pool' as const,
          poolId,
          playerAId: Number(pairing.playerA),
          playerBId: Number(pairing.playerB),
          raceTo,
          scheduleOrder: index,
        })),
      );
    }
  }
}

/** Deletes every pool match, results included (before the pools are drawn again). */
export async function deletePoolMatches(db: Executor, tournamentId: number) {
  await db
    .delete(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'pool')));
}
