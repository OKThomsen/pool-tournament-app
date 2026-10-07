import { DEFAULT_POINTS_TABLE, placements, type Placement, type PointsTable } from '@franks/core';
import { sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { pointsTable, results } from '../db/schema.js';
import type { TournamentDetail } from './detail.js';
import { currentBracket, standingsByPool } from './knockout.js';

/**
 * Writes every player's result for a finished tournament: placement, points (from the points
 * table) and matches won (pool wins, like the workbook's "Matches Won"). The handicap snapshot is
 * taken the first time and kept when a correction rewrites the results.
 */
export async function writeResults(db: Executor, detail: TournamentDetail): Promise<void> {
  // The points table in the database, with the workbook's defaults for any missing row.
  const table: PointsTable = {
    ...DEFAULT_POINTS_TABLE,
    ...Object.fromEntries(
      (await db.select().from(pointsTable)).map((row) => [row.placement, row.points]),
    ),
  };
  const placed = placements(
    detail.players.map((p) => String(p.id)),
    currentBracket(detail),
  );
  const poolWins = new Map(
    standingsByPool(detail)
      .flat()
      .map((row) => [Number(row.playerId), row.won]),
  );

  const rows = detail.players.map((player) => {
    const placement = placed.get(String(player.id)) as Placement;
    return {
      tournamentId: detail.id,
      playerId: player.id,
      placement,
      points: table[placement],
      matchesWon: poolWins.get(player.id) ?? 0,
      baseHandicap: player.baseHandicap,
      frameHandicap: player.frameHandicap,
    };
  });
  await db
    .insert(results)
    .values(rows)
    .onConflictDoUpdate({
      target: [results.tournamentId, results.playerId],
      set: {
        placement: sql`excluded.placement`,
        points: sql`excluded.points`,
        matchesWon: sql`excluded.matches_won`,
      },
    });
}
