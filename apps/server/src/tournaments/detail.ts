import { seasonForDate } from '@franks/core';
import { asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import {
  knockoutSeeds,
  matches,
  players,
  poolMembers,
  pools,
  results,
  tournamentPlayers,
  tournaments,
} from '../db/schema.js';
import { isMemberOn, qualified } from '../db/seasons.js';

/** Everything about one tournament, as the admin and live views need it. */
export async function tournamentDetail(db: Executor, id: number) {
  const [tournament] = await db
    .select({
      id: tournaments.id,
      date: tournaments.date,
      week: tournaments.week,
      format: tournaments.format,
      status: tournaments.status,
      knockoutSize: tournaments.knockoutSize,
    })
    .from(tournaments)
    .where(eq(tournaments.id, id));
  if (!tournament) return null;

  const entrants = await db
    .select({
      id: players.id,
      name: players.name,
      baseHandicap: players.baseHandicap,
      frameHandicap: players.frameHandicap,
      // Medlem on the day of the tournament.
      member: isMemberOn(tournament.date, players.id),
    })
    .from(tournamentPlayers)
    .innerJoin(players, eq(players.id, tournamentPlayers.playerId))
    .where(eq(tournamentPlayers.tournamentId, id))
    .orderBy(players.name);

  const memberRows = await db
    .select({
      poolId: pools.id,
      name: pools.name,
      playerId: poolMembers.playerId,
      tiebreak: poolMembers.adminTiebreak,
    })
    .from(pools)
    .innerJoin(poolMembers, eq(poolMembers.poolId, pools.id))
    .where(eq(pools.tournamentId, id))
    .orderBy(asc(pools.name), asc(poolMembers.position));
  // `tiebreak` is the admin's order for ties that results can't break (see poolStandings).
  const poolList: { id: number; name: string; playerIds: number[]; tiebreak: number[] }[] = [];
  for (const row of memberRows) {
    let pool = poolList.find((p) => p.id === row.poolId);
    if (!pool) {
      pool = { id: row.poolId, name: row.name, playerIds: [], tiebreak: [] };
      poolList.push(pool);
    }
    pool.playerIds.push(row.playerId);
  }
  for (const pool of poolList) {
    pool.tiebreak = memberRows
      .filter((row) => row.poolId === pool.id && row.tiebreak !== null)
      .sort((a, b) => a.tiebreak! - b.tiebreak!)
      .map((row) => row.playerId);
  }

  const matchList = await db
    .select({
      id: matches.id,
      stage: matches.stage,
      poolId: matches.poolId,
      slot: matches.slot,
      playerAId: matches.playerAId,
      playerBId: matches.playerBId,
      raceTo: matches.raceTo,
      framesA: matches.framesA,
      framesB: matches.framesB,
      scheduleOrder: matches.scheduleOrder,
    })
    .from(matches)
    .where(eq(matches.tournamentId, id))
    .orderBy(asc(matches.poolId), asc(matches.scheduleOrder), asc(matches.id));

  // Knockout seeds, best first. Empty until "complete qualifier brackets".
  const seeds = (
    await db
      .select({ playerId: knockoutSeeds.playerId })
      .from(knockoutSeeds)
      .where(eq(knockoutSeeds.tournamentId, id))
      .orderBy(asc(knockoutSeeds.seed))
  ).map((row) => row.playerId);

  // Final placings, best first (the placement enum is declared in that order). Empty until
  // "conclude tournament".
  const placings = await db
    .select({
      playerId: results.playerId,
      placement: results.placement,
      points: results.points,
      matchesWon: results.matchesWon,
    })
    .from(results)
    .where(eq(results.tournamentId, id))
    .orderBy(asc(results.placement), asc(results.playerId));

  return {
    ...tournament,
    season: seasonLabel(tournament.date),
    players: entrants,
    pools: poolList,
    matches: matchList,
    seeds,
    results: placings,
  };
}

export type TournamentDetail = NonNullable<Awaited<ReturnType<typeof tournamentDetail>>>;

/** The tournament that hasn't been concluded yet, if any. There is at most one. */
export async function ongoingTournament(db: Executor) {
  const [row] = await db
    .select({ id: tournaments.id, date: tournaments.date, status: tournaments.status })
    .from(tournaments)
    .where(ne(tournaments.status, 'concluded'))
    .limit(1);
  return row ?? null;
}

/** The label of the season a date is in, or null for the off-season. */
function seasonLabel(date: string): string | null {
  return seasonForDate(date)?.label ?? null;
}

/** Concluded tournaments, newest first: date, format, winner and number of players. */
export async function concludedTournaments(db: Executor) {
  const rows = await db
    .select({
      id: tournaments.id,
      date: tournaments.date,
      week: tournaments.week,
      format: tournaments.format,
      winner: sql<string | null>`(
        select ${players.name} from ${results}
        join ${players} on ${qualified(players.id)} = ${qualified(results.playerId)}
        where ${qualified(results.tournamentId)} = ${qualified(tournaments.id)}
          and ${qualified(results.placement)} = '1st'
      )`,
      participants: sql<number>`(
        select count(*)::int from ${tournamentPlayers}
        where ${qualified(tournamentPlayers.tournamentId)} = ${qualified(tournaments.id)}
      )`,
    })
    .from(tournaments)
    .where(eq(tournaments.status, 'concluded'))
    .orderBy(desc(tournaments.date), desc(tournaments.id));
  return rows.map((row) => ({ ...row, season: seasonLabel(row.date) }));
}
