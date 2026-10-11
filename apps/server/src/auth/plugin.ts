import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Database } from '../db/client.js';
import { playerForToken, type SessionPlayer } from './playerSessions.js';
import { adminForToken, type SessionAdmin } from './sessions.js';

export const SESSION_COOKIE = 'session';
/** Set when a player enters a join code on /play. Separate from the admin session. */
export const PLAYER_COOKIE = 'player';

declare module 'fastify' {
  interface FastifyRequest {
    /** The logged-in admin, or null for the public. */
    admin: SessionAdmin | null;
    /** A player who joined a tournament in progress with its code, or null. */
    player: SessionPlayer | null;
  }
}

/** Use as a route's preHandler to make it admin-only. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.admin) return reply.code(401).send({ error: 'unauthorized' });
}

/**
 * Use as the preHandler of a route under /tournaments/:id that players may use too: admins, and
 * players who joined that tournament with its code.
 */
export async function requireScorer(request: FastifyRequest, reply: FastifyReply) {
  if (request.admin) return;
  const { id } = request.params as { id: number };
  if (request.player?.tournamentId !== id) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

/**
 * Reads the session cookies on every request and sets `request.admin` and `request.player`.
 * Wrapped in fastify-plugin so it applies to the whole app, not just the routes registered
 * inside it.
 */
export const sessionPlugin = fp<{ db: Database }>(async (app, { db }) => {
  await app.register(fastifyCookie);
  app.decorateRequest('admin', null);
  app.decorateRequest('player', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.admin = token ? await adminForToken(db, token) : null;
    const playerToken = request.cookies[PLAYER_COOKIE];
    request.player = playerToken ? await playerForToken(db, playerToken) : null;
  });
});
