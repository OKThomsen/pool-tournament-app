import { config } from '../config.js';
import { createDb, runMigrations } from './client.js';

const { db, pool } = createDb(config.databaseUrl);
await runMigrations(db);
await pool.end();
console.log('Migrations applied');
