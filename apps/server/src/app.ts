import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { Database } from './db/client.js';
import { healthRoutes } from './routes/health.js';

export interface AppOptions {
  db: Database;
  /** Built frontend to serve. Leave unset in development, where Vite serves it. */
  webDist?: string;
  logger?: boolean;
}

export async function buildApp({ db, webDist, logger = true }: AppOptions) {
  const app = Fastify({ logger });
  await app.register(healthRoutes, { prefix: '/api', db });

  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    // Client-side routes (/turneringer/12, /live, …) all load the single-page app.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
