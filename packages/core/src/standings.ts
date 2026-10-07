import { winnerOf } from './match.js';
import type { MatchResult, PlayerId } from './types.js';

export interface StandingRow {
  playerId: PlayerId;
  played: number;
  won: number;
  lost: number;
  framesFor: number;
  framesAgainst: number;
  /** Frames for minus frames against ("Set Score" in the workbook). */
  setScore: number;
  /** 1-based. Players in an unresolved tie share the same rank. */
  rank: number;
  /** True when wins, set score and head-to-head all fail to separate this player from another. */
  unresolvedTie: boolean;
}

/**
 * Ranks a pool: matches won, then set score, then head-to-head between the tied players.
 *
 * Head-to-head with three or more tied players is a mini-league of their matches against each
 * other, applied again to any players it still leaves level. A tie it can't break (a cycle, or
 * a match not played yet) is flagged with `unresolvedTie` rather than broken arbitrarily.
 */
export function poolStandings(
  players: readonly PlayerId[],
  results: readonly MatchResult[],
): StandingRow[] {
  const stats = new Map(players.map((id) => [id, emptyRow(id)]));
  for (const result of results) {
    const a = stats.get(result.playerA);
    const b = stats.get(result.playerB);
    if (!a || !b) throw new Error(`Result involves a player outside the pool`);
    const winner = winnerOf(result);
    for (const [row, own, other] of [
      [a, result.framesA, result.framesB],
      [b, result.framesB, result.framesA],
    ] as const) {
      row.played++;
      row.framesFor += own;
      row.framesAgainst += other;
      if (row.playerId === winner) row.won++;
      else row.lost++;
    }
  }
  for (const row of stats.values()) row.setScore = row.framesFor - row.framesAgainst;

  const byRecord = groupBy([...stats.values()], (row) => [row.won, row.setScore]);
  const ordered = byRecord.flatMap((group) =>
    breakByHeadToHead(
      group.map((row) => row.playerId),
      results,
    ),
  );

  const rows: StandingRow[] = [];
  let position = 1;
  for (const tiedGroup of ordered) {
    for (const playerId of tiedGroup) {
      rows.push({ ...stats.get(playerId)!, rank: position, unresolvedTie: tiedGroup.length > 1 });
    }
    position += tiedGroup.length;
  }
  return rows;
}

/** Orders tied players by wins among themselves. Returns groups that are still tied. */
function breakByHeadToHead(tied: PlayerId[], results: readonly MatchResult[]): PlayerId[][] {
  if (tied.length === 1) return [tied];
  const inGroup = new Set(tied);
  const h2hWins = new Map(tied.map((id) => [id, 0]));
  for (const result of results) {
    if (inGroup.has(result.playerA) && inGroup.has(result.playerB)) {
      const winner = winnerOf(result);
      h2hWins.set(winner, h2hWins.get(winner)! + 1);
    }
  }
  const groups = groupBy(tied, (id) => [h2hWins.get(id)!]);
  if (groups.length === 1) return [tied];
  return groups.flatMap((group) => breakByHeadToHead(group, results));
}

/** Splits items into groups with equal keys, ordered by key descending. Stable within a group. */
function groupBy<T>(items: readonly T[], key: (item: T) => number[]): T[][] {
  const sorted = [...items].sort((x, y) => compareDesc(key(x), key(y)));
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    if (last && compareDesc(key(last[0]!), key(item)) === 0) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

function compareDesc(x: number[], y: number[]): number {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return y[i]! - x[i]!;
  }
  return 0;
}

function emptyRow(playerId: PlayerId): StandingRow {
  return {
    playerId,
    played: 0,
    won: 0,
    lost: 0,
    framesFor: 0,
    framesAgainst: 0,
    setScore: 0,
    rank: 0,
    unresolvedTie: false,
  };
}
