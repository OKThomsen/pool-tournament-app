import { sql } from 'drizzle-orm';
import { createDb, type Database } from '../db/client.js';

/** A separate database in the dev Postgres, so tests never touch dev data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://franks:franks@localhost:5432/franks_test';

export function createTestDb() {
  return createDb(TEST_DATABASE_URL);
}

/** Empties every table except reference data (the points table). */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`
    truncate table sessions, admins, results, matches, knockout_seeds, pool_members, pools,
      tournament_players, tournaments, seasons, players
    restart identity cascade
  `);
}
