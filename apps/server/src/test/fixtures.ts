import { pointsFor, todayInDenmark, type Placement } from '@franks/core';
import { vi } from 'vitest';
import type { Database } from '../db/client.js';
import { players, results, tournamentPlayers, tournaments } from '../db/schema.js';

export async function addPlayers(db: Database, ...names: string[]) {
  return db
    .insert(players)
    .values(names.map((name) => ({ name })))
    .returning();
}

/**
 * Pretends today is `date` (YYYY-MM-DD, midday in Denmark), so season rules don't depend on when
 * the tests run. Undo it with `vi.useRealTimers()`.
 */
export function setToday(date: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${date}T10:00:00Z`));
}

/**
 * A concluded tournament with the given placements (and pool wins, 0 unless given), scored with
 * the default points table. Defaults to today.
 */
export async function addTournament(
  db: Database,
  {
    knockoutSize = 8,
    placements,
    date = todayInDenmark(),
    forFun = false,
    historical = false,
  }: {
    knockoutSize?: 4 | 8;
    placements: [playerId: number, placement: Placement, poolWins?: number][];
    date?: string;
    forFun?: boolean;
    historical?: boolean;
  },
) {
  const [tournament] = await db
    .insert(tournaments)
    .values({
      date,
      week: 1,
      format: '8-ball',
      knockoutSize,
      status: 'concluded',
      forFun,
      historical,
    })
    .returning();
  for (const [playerId, placement, poolWins = 0] of placements) {
    await db.insert(tournamentPlayers).values({ tournamentId: tournament!.id, playerId });
    await db.insert(results).values({
      tournamentId: tournament!.id,
      playerId,
      placement,
      points: pointsFor(placement),
      matchesWon: poolWins,
      baseHandicap: 0,
      frameHandicap: 0,
    });
  }
  return tournament!;
}
