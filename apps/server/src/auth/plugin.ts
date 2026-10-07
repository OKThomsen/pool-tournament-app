import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Database } from '../db/client.js';
import { adminForToken, type SessionAdmin } from './sessions.js';

export const SESSION_COOKIE = 'session';

declare module 'fastify' {
  interface FastifyRequest {
    /** The logged-in admin, or null for the public. */
    admin: SessionAdmin | null;
  }
}

/** Use as a route's preHandler to make it admin-only. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.admin) return reply.code(401).send({ error: 'unauthorized' });
}

/**
 * Reads the session cookie on every request and sets `request.admin`. Wrapped in
 * fastify-plugin so it applies to the whole app, not just the routes registered inside it.
 */
export const sessionPlugin = fp<{ db: Database }>(async (app, { db }) => {
  await app.register(fastifyCookie);
  app.decorateRequest('admin', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.admin = token ? await adminForToken(db, token) : null;
  });
});
