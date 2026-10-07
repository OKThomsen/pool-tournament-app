import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { sessionPlugin } from './auth/plugin.js';
import type { Database } from './db/client.js';
import { Events } from './events.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { playerRoutes } from './routes/players.js';
import { seasonRoutes } from './routes/seasons.js';
import { tournamentRoutes } from './routes/tournaments.js';

export interface AppOptions {
  db: Database;
  /** Built frontend to serve. Leave unset in development, where Vite serves it. */
  webDist?: string;
  /** Only send the session cookie over HTTPS. */
  secureCookies?: boolean;
  logger?: boolean;
  /** Shared with the routes; tests pass their own to listen in. */
  events?: Events;
}

export async function buildApp({
  db,
  webDist,
  secureCookies = false,
  logger = true,
  events = new Events(),
}: AppOptions) {
  // Close open live-update streams on shutdown instead of waiting for them.
  const app = Fastify({ logger, forceCloseConnections: true });
  // Off by default; routes opt in (the login route limits attempts per IP).
  await app.register(fastifyRateLimit, { global: false });
  await app.register(sessionPlugin, { db });
  await app.register(healthRoutes, { prefix: '/api', db });
  await app.register(authRoutes, { prefix: '/api', db, secureCookies });
  await app.register(playerRoutes, { prefix: '/api', db });
  await app.register(seasonRoutes, { prefix: '/api', db });
  await app.register(tournamentRoutes, { prefix: '/api', db, events });
  await app.register(eventRoutes, { prefix: '/api', events });

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
