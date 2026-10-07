import { buildApp } from './app.js';
import { config } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { seedDefaults } from './db/seed.js';

const { db, pool } = createDb(config.databaseUrl);
await runMigrations(db);
await seedDefaults(db);

const app = await buildApp({ db });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
