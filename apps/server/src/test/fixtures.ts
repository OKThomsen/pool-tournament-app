import { pointsFor, type Placement } from '@franks/core';
import type { Database } from '../db/client.js';
import { players, results, tournamentPlayers, tournaments } from '../db/schema.js';
import { currentSeason, seasonId } from '../db/seasons.js';

export async function addPlayers(db: Database, ...names: string[]) {
  return db
    .insert(players)
    .values(names.map((name) => ({ name })))
    .returning();
}

/**
 * A concluded tournament with the given placements, scored with the default points table.
 * Defaults to the current season.
 */
export async function addTournament(
  db: Database,
  {
    knockoutSize = 8,
    placements,
    season = currentSeason(),
  }: {
    knockoutSize?: 4 | 8;
    placements: [playerId: number, placement: Placement][];
    season?: { label: string; start: string };
  },
) {
  const [tournament] = await db
    .insert(tournaments)
    .values({
      date: season.start,
      seasonId: await seasonId(db, season.label),
      week: 1,
      format: '8-ball',
      knockoutSize,
      status: 'concluded',
    })
    .returning();
  for (const [playerId, placement] of placements) {
    await db.insert(tournamentPlayers).values({ tournamentId: tournament!.id, playerId });
    await db.insert(results).values({
      tournamentId: tournament!.id,
      playerId,
      placement,
      points: pointsFor(placement),
      matchesWon: 0,
      baseHandicap: 0,
      frameHandicap: 0,
    });
  }
  return tournament!;
}
