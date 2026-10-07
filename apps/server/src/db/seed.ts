import { DEFAULT_POINTS_TABLE, type Placement } from '@franks/core';
import type { Database } from './client.js';
import { pointsTable } from './schema.js';

/** Inserts reference data that must exist. Leaves rows an admin has already changed alone. */
export async function seedDefaults(db: Database): Promise<void> {
  const rows = Object.entries(DEFAULT_POINTS_TABLE).map(([placement, points]) => ({
    placement: placement as Placement,
    points,
  }));
  await db.insert(pointsTable).values(rows).onConflictDoNothing();
}
