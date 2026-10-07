import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/client.js';

export const healthRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.get('/health', async () => {
    await db.execute(sql`select 1`);
    return { status: 'ok' };
  });
};
