import { poolStandings, type MatchResult, type StandingRow } from '@franks/core';
import type { Match, Pool, Tournament } from './tournaments';

export interface PoolView {
  pool: Pool;
  /** By player id. */
  standings: Map<number, StandingRow>;
  /** The match between two players, either way round. */
  matchBetween: (a: number, b: number) => Match | undefined;
  /** Pools of 3 and 5 follow a schedule; even pools play whoever they haven't played yet. */
  scheduled: boolean;
  /** The next matches to play (scheduled pools only): as many as can be played at once. */
  next: Match[];
  /** Who sits out while `next` is played. */
  sittingOut: number | null;
  complete: boolean;
}

export const isPlayed = (m: Match) => m.framesA !== null && m.framesB !== null;

/** Standings, schedule and "up next" for one pool, worked out with @franks/core. */
export function poolView(tournament: Tournament, pool: Pool): PoolView {
  const matches = tournament.matches
    .filter((m) => m.poolId === pool.id)
    .sort((a, b) => (a.scheduleOrder ?? 0) - (b.scheduleOrder ?? 0));
  const played = matches.filter(isPlayed);
  const results: MatchResult[] = played.map((m) => ({
    playerA: String(m.playerAId),
    playerB: String(m.playerBId),
    framesA: m.framesA!,
    framesB: m.framesB!,
  }));
  const rows = poolStandings(pool.playerIds.map(String), results, pool.tiebreak.map(String));

  const scheduled = pool.playerIds.length % 2 === 1;
  const atOnce = Math.floor(pool.playerIds.length / 2);
  // The next unplayed matches in schedule order, skipping any that would put a player at two
  // tables at once (possible if a later match was played early).
  const next: Match[] = [];
  const busy = new Set<number | null>();
  for (const m of scheduled ? matches : []) {
    if (next.length === atOnce) break;
    if (isPlayed(m) || busy.has(m.playerAId) || busy.has(m.playerBId)) continue;
    next.push(m);
    busy.add(m.playerAId).add(m.playerBId);
  }
  const idle = pool.playerIds.filter((id) => !busy.has(id));

  return {
    pool,
    standings: new Map(rows.map((row) => [Number(row.playerId), row])),
    matchBetween: (a, b) =>
      matches.find(
        (m) => (m.playerAId === a && m.playerBId === b) || (m.playerAId === b && m.playerBId === a),
      ),
    scheduled,
    next,
    sittingOut: next.length === atOnce && idle.length === 1 ? idle[0]! : null,
    complete: played.length === matches.length,
  };
}

/** A match's score from one player's point of view, e.g. "2-1". */
export function scoreFor(match: Match, player: number): { text: string; won: boolean } {
  const own = match.playerAId === player ? match.framesA! : match.framesB!;
  const other = match.playerAId === player ? match.framesB! : match.framesA!;
  return { text: `${own}-${other}`, won: own > other };
}
