import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { requireAdmin, SESSION_COOKIE } from '../auth/plugin.js';
import { createSession, deleteSession, SESSION_DAYS } from '../auth/sessions.js';
import type { Database } from '../db/client.js';
import { admins } from '../db/schema.js';

export interface AuthRoutesOptions {
  db: Database;
  /** Send the cookie over HTTPS only. On in production, off for local http. */
  secureCookies: boolean;
}

// Checked when the username doesn't exist, so a wrong username takes as long as a wrong
// password and the response time doesn't reveal which usernames exist.
const dummyHash = hashPassword('not a real password');

/** Login, logout and "who am I". There is deliberately no route that creates admins. */
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  { db, secureCookies },
) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
  } as const;

  app.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 100 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const [admin] = await db.select().from(admins).where(eq(admins.username, username));
      const valid = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
      if (!admin || !valid) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      const token = await createSession(db, admin.id);
      reply.setCookie(SESSION_COOKIE, token, {
        ...cookieOptions,
        maxAge: SESSION_DAYS * 24 * 60 * 60,
      });
      return { username: admin.username };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAdmin }, async (request) => ({
    username: request.admin!.username,
  }));
};
