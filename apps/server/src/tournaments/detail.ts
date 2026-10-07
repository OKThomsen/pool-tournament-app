import { asc, eq, ne } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import {
  knockoutSeeds,
  matches,
  players,
  poolMembers,
  pools,
  seasons,
  tournamentPlayers,
  tournaments,
} from '../db/schema.js';
import { isMemberIn } from '../db/seasons.js';

/** Everything about one tournament, as the admin and live views need it. */
export async function tournamentDetail(db: Executor, id: number) {
  const [tournament] = await db
    .select({
      id: tournaments.id,
      date: tournaments.date,
      week: tournaments.week,
      season: seasons.label,
      format: tournaments.format,
      status: tournaments.status,
      knockoutSize: tournaments.knockoutSize,
    })
    .from(tournaments)
    .innerJoin(seasons, eq(seasons.id, tournaments.seasonId))
    .where(eq(tournaments.id, id));
  if (!tournament) return null;

  const entrants = await db
    .select({
      id: players.id,
      name: players.name,
      baseHandicap: players.baseHandicap,
      frameHandicap: players.frameHandicap,
      member: isMemberIn(tournament.season, players.id),
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

  return { ...tournament, players: entrants, pools: poolList, matches: matchList, seeds };
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
