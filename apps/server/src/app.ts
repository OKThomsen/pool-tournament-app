import Fastify from 'fastify';
import type { Database } from './db/client.js';
import { healthRoutes } from './routes/health.js';

export interface AppOptions {
  db: Database;
  logger?: boolean;
}

export async function buildApp({ db, logger = true }: AppOptions) {
  const app = Fastify({ logger });
  await app.register(healthRoutes, { prefix: '/api', db });
  return app;
}
