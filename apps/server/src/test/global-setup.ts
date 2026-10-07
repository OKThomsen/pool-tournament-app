import pg from 'pg';
import { runMigrations } from '../db/client.js';
import { seedDefaults } from '../db/seed.js';
import { createTestDb, TEST_DATABASE_URL } from './database.js';

/** Creates the test database if needed, migrates it and adds the reference data (points table). */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`Can't reach Postgres for tests. Is it running (docker compose up -d db)?`, {
      cause: error,
    });
  }
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
  if (!rowCount) await admin.query(`create database "${name}"`);
  await admin.end();

  const { db, pool } = createTestDb();
  await runMigrations(db);
  await seedDefaults(db);
  await pool.end();
}
