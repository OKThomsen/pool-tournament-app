import { playOrder, roundRobinRounds, samePairing } from '@franks/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { matches, poolMembers, pools } from '../db/schema.js';

/** Pool names in order: A, B, C … */
const poolName = (index: number) => String.fromCharCode(65 + index);

/**
 * Pairs each new pool with the existing pool row it shares the most players with, so a row (with
 * its matches, results and race length) stays with its players when the pools before it are
 * removed or added. Pools that share no players take the rows left over, in order. Returns the
 * row id per new pool (undefined: a new row is needed) and the rows no pool uses.
 */
function matchPoolRows(
  existing: { id: number; playerIds: number[] }[],
  arrangement: number[][],
): { rows: (number | undefined)[]; unused: number[] } {
  const overlaps = arrangement
    .flatMap((playerIds, index) =>
      existing.map((row) => ({
        index,
        id: row.id,
        shared: playerIds.filter((p) => row.playerIds.includes(p)).length,
      })),
    )
    .filter((overlap) => overlap.shared > 0)
    .sort((x, y) => y.shared - x.shared);
  const rows: (number | undefined)[] = arrangement.map(() => undefined);
  const taken = new Set<number>();
  for (const { index, id } of overlaps) {
    if (rows[index] !== undefined || taken.has(id)) continue;
    rows[index] = id;
    taken.add(id);
  }
  const free = existing.map((row) => row.id).filter((id) => !taken.has(id));
  for (const index of rows.keys()) {
    if (rows[index] === undefined && free.length > 0) rows[index] = free.shift();
  }
  return { rows, unused: free };
}

/**
 * Saves the pools (player ids per pool, in order). Each pool keeps the row of the pool most of
 * its players were in, so its matches, results and race length stay; pools with no row left are
 * added (with the race length of the pool before them) and rows no pool uses are deleted. Then
 * the pools are named A, B, C … in order. A pool whose players changed loses the admin's
 * tiebreak, which only applied to the old line-up. Call syncPoolMatches afterwards once the
 * pools are being played.
 */
export async function savePools(db: Executor, tournamentId: number, arrangement: number[][]) {
  const existing = await db
    .select({ id: pools.id, raceTo: pools.raceTo })
    .from(pools)
    .where(eq(pools.tournamentId, tournamentId))
    .orderBy(asc(pools.name));
  const lineUps =
    existing.length === 0
      ? []
      : await db
          .select({ poolId: poolMembers.poolId, playerId: poolMembers.playerId })
          .from(poolMembers)
          .where(
            inArray(
              poolMembers.poolId,
              existing.map((pool) => pool.id),
            ),
          );
  const { rows, unused } = matchPoolRows(
    existing.map((pool) => ({
      id: pool.id,
      playerIds: lineUps.filter((m) => m.poolId === pool.id).map((m) => m.playerId),
    })),
    arrangement,
  );
  if (unused.length > 0) await db.delete(pools).where(inArray(pools.id, unused));
  // Names are unique per tournament, so move the kept rows out of the way before renaming them.
  for (const id of rows) {
    if (id !== undefined)
      await db
        .update(pools)
        .set({ name: `~${id}` })
        .where(eq(pools.id, id));
  }

  let raceTo = existing[0]?.raceTo;
  for (const [index, playerIds] of arrangement.entries()) {
    let poolId = rows[index];
    if (poolId === undefined) {
      const [pool] = await db
        .insert(pools)
        .values({ tournamentId, name: poolName(index), raceTo })
        .returning({ id: pools.id });
      poolId = pool!.id;
    } else {
      const [pool] = await db
        .update(pools)
        .set({ name: poolName(index) })
        .where(eq(pools.id, poolId))
        .returning({ raceTo: pools.raceTo });
      raceTo = pool!.raceTo;
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

/**
 * Makes each pool's matches fit its players: a match between two players who are both still in
 * the pool keeps its result, matches with a player who left the pool are deleted, and missing
 * pairings are added with the pool's race length. Every pool's play order is rebuilt.
 */
export async function syncPoolMatches(db: Executor, tournamentId: number) {
  const members = await db
    .select({ poolId: pools.id, raceTo: pools.raceTo, playerId: poolMembers.playerId })
    .from(pools)
    .innerJoin(poolMembers, eq(poolMembers.poolId, pools.id))
    .where(eq(pools.tournamentId, tournamentId))
    .orderBy(asc(pools.name), asc(poolMembers.position));
  const poolIds = [...new Set(members.map((m) => m.poolId))];

  for (const poolId of poolIds) {
    const inPool = members.filter((m) => m.poolId === poolId);
    const playerIds = inPool.map((m) => String(m.playerId));
    const raceTo = inPool[0]!.raceTo;
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
