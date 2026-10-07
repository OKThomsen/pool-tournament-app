import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { admins, sessions } from '../db/schema.js';
import { createTestDb, resetDb } from '../test/database.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
const PASSWORD = 'korrekt-hest-batteri';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDb(db);
  await db.insert(admins).values({ username: 'frank', passwordHash });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function login(username: string, password: string, ip = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
    remoteAddress: ip,
  });
}

function sessionCookie(response: Awaited<ReturnType<typeof login>>) {
  const cookie = response.cookies.find((c) => c.name === 'session');
  return { session: cookie!.value };
}

describe('POST /api/auth/login', () => {
  it('logs in with the right password and sets a secure session cookie', async () => {
    const response = await login('frank', PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: 'frank' });
    const cookie = response.cookies.find((c) => c.name === 'session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('stores only a hash of the session token', async () => {
    const response = await login('frank', PASSWORD);
    const [row] = await db.select().from(sessions);
    expect(row!.id).not.toBe(sessionCookie(response).session);
  });

  it('gives the same answer for a wrong password and an unknown username', async () => {
    const wrongPassword = await login('frank', 'forkert-kodeord');
    const unknownUser = await login('nobody', PASSWORD);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    expect(wrongPassword.cookies).toEqual([]);
  });

  it('rejects a malformed request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'frank' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('limits login attempts per IP address', async () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 10; i++) {
      expect((await login('frank', 'forkert-kodeord', ip)).statusCode).toBe(401);
    }
    expect((await login('frank', PASSWORD, ip)).statusCode).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  it("returns the logged-in admin's name", async () => {
    const cookies = sessionCookie(await login('frank', PASSWORD));
    const response = await app.inject({ url: '/api/auth/me', cookies });
    expect(response.json()).toEqual({ username: 'frank' });
  });

  it('is 401 without a session, with an unknown one, or with an expired one', async () => {
    expect((await app.inject({ url: '/api/auth/me' })).statusCode).toBe(401);
    const unknown = await app.inject({ url: '/api/auth/me', cookies: { session: 'made-up' } });
    expect(unknown.statusCode).toBe(401);

    const cookies = sessionCookie(await login('frank', PASSWORD));
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await app.inject({ url: '/api/auth/me', cookies })).statusCode).toBe(401);
  });

  it('is 401 once the admin is deleted', async () => {
    const cookies = sessionCookie(await login('frank', PASSWORD));
    await db.delete(admins).where(eq(admins.username, 'frank'));
    expect((await app.inject({ url: '/api/auth/me', cookies })).statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session', async () => {
    const cookies = sessionCookie(await login('frank', PASSWORD));
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
    expect(response.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/auth/me', cookies })).statusCode).toBe(401);
    expect(await db.select().from(sessions)).toEqual([]);
  });
});

describe('account creation', () => {
  it.each(['/api/auth/register', '/api/auth/signup', '/api/admins'])(
    'has no route at %s',
    async (url) => {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: { username: 'x', password: 'y' },
      });
      expect(response.statusCode).toBe(404);
    },
  );
});
