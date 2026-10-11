import type { FastifyPluginAsync } from 'fastify';
import {
  createPlayerSession,
  deletePlayerSession,
  PLAYER_SESSION_HOURS,
  tournamentForCode,
} from '../auth/playerSessions.js';
import { PLAYER_COOKIE } from '../auth/plugin.js';
import type { Database } from '../db/client.js';

export interface PlayRoutesOptions {
  db: Database;
  /** Send the cookie over HTTPS only. On in production, off for local http. */
  secureCookies: boolean;
}

/**
 * /play: players enter the tournament's join code and may then score its matches (see
 * requireScorer). Nothing else; drawing, qualifying and concluding stay with the admins.
 */
export const playRoutes: FastifyPluginAsync<PlayRoutesOptions> = async (
  app,
  { db, secureCookies },
) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
  } as const;

  app.post<{ Body: { code: string } }>(
    '/play/join',
    {
      // Everyone in the club shares one IP on the wifi, so this allows plenty of typos, while a
      // million codes still can't be guessed at this rate.
      config: { rateLimit: { max: 50, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } },
        },
      },
    },
    async (request, reply) => {
      const tournamentId = await tournamentForCode(db, request.body.code);
      if (tournamentId === null) return reply.code(404).send({ error: 'unknown_code' });
      const token = await createPlayerSession(db, tournamentId);
      reply.setCookie(PLAYER_COOKIE, token, {
        ...cookieOptions,
        maxAge: PLAYER_SESSION_HOURS * 60 * 60,
      });
      return { tournamentId };
    },
  );

  /** The tournament this browser joined, or 401 when it hasn't (or the session ended). */
  app.get('/play/me', async (request, reply) =>
    request.player
      ? { tournamentId: request.player.tournamentId }
      : reply.code(401).send({ error: 'not_joined' }),
  );

  app.post('/play/leave', async (request, reply) => {
    const token = request.cookies[PLAYER_COOKIE];
    if (token) await deletePlayerSession(db, token);
    reply.clearCookie(PLAYER_COOKIE, cookieOptions);
    return reply.code(204).send();
  });
};
