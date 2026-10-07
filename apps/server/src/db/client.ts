import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDb>['db'];
/** The database or a transaction on it; both run queries the same way. */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return { db: drizzle(pool, { schema }), pool };
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}
