import { DEFAULT_POINTS_TABLE, placements, type Placement, type PointsTable } from '@franks/core';
import { sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { pointsTable, results } from '../db/schema.js';
import type { TournamentDetail } from './detail.js';
import { currentBracket, poolOrder, standingsByPool } from './knockout.js';

/**
 * Writes every player's result for a finished tournament: placement, points (from the points
 * table) and matches won (pool wins, like the workbook's "Matches Won"). The handicap snapshot is
 * taken the first time and kept when a correction rewrites the results.
 *
 * In a "Par turnering" both players of a team get the team's result, and every team gets the
 * participation points whatever its placement: duo tournaments only count as participation.
 */
export async function writeResults(db: Executor, detail: TournamentDetail): Promise<void> {
  const table = await loadPointsTable(db);
  const placed = placements(
    detail.players.map((p) => String(p.id)),
    currentBracket(detail),
    poolOrder(detail),
  );
  const poolWins = new Map(
    standingsByPool(detail)
      .flat()
      .map((row) => [Number(row.playerId), row.won]),
  );

  const rows = detail.players.flatMap((entrant) => {
    const placement = placed.get(String(entrant.id)) as Placement;
    const result = {
      tournamentId: detail.id,
      placement,
      points: table[detail.duo ? 'participation' : placement],
      matchesWon: poolWins.get(entrant.id) ?? 0,
    };
    return [entrant, ...(entrant.partner ? [entrant.partner] : [])].map((player) => ({
      ...result,
      playerId: player.id,
      baseHandicap: player.baseHandicap,
      frameHandicap: player.frameHandicap,
    }));
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

/** The points table in the database, with the workbook's defaults for any missing row. */
export async function loadPointsTable(db: Executor): Promise<PointsTable> {
  return {
    ...DEFAULT_POINTS_TABLE,
    ...Object.fromEntries(
      (await db.select().from(pointsTable)).map((row) => [row.placement, row.points]),
    ),
  };
}
