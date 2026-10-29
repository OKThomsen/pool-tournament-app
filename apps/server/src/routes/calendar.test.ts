import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
let cookies: { session: string };

beforeEach(async () => {
  await resetDb(db);
  setToday('2026-10-28');
  cookies = await loginAsAdmin(db);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function post(date: string, message: string) {
  return app.inject({ method: 'POST', url: '/api/calendar', cookies, payload: { date, message } });
}

describe('calendar', () => {
  it('lists coming events soonest first, from today on', async () => {
    await post('2026-11-04', 'Juleturnering');
    await post('2026-10-28', '  Pizza efter turneringen ');
    setToday('2026-10-29');
    await post('2026-11-04', 'Husk kontingent');

    const response = await app.inject({ url: '/api/calendar' });
    expect(response.statusCode).toBe(200);
    // The 28th has passed; events on the same date keep the order they were posted in.
    expect(response.json()).toEqual([
      { id: 1, date: '2026-11-04', message: 'Juleturnering' },
      { id: 3, date: '2026-11-04', message: 'Husk kontingent' },
    ]);

    setToday('2026-10-28');
    expect((await app.inject({ url: '/api/calendar' })).json()[0]).toMatchObject({
      date: '2026-10-28',
      message: 'Pizza efter turneringen',
    });
  });

  it('refuses dates in the past and empty messages', async () => {
    expect((await post('2026-10-27', 'For sent')).json()).toEqual({ error: 'date_in_past' });
    expect((await post('2026-10-30', '   ')).statusCode).toBe(400);
    expect((await post('2026-10-30', 'x'.repeat(201))).statusCode).toBe(400);
  });

  it('lets admins edit and delete events', async () => {
    const { id } = (await post('2026-11-04', 'Juleturnering')).json();

    const edited = await app.inject({
      method: 'PUT',
      url: `/api/calendar/${id}`,
      cookies,
      payload: { date: '2026-12-02', message: 'Juleturnering med gløgg' },
    });
    expect(edited.json()).toEqual({ id, date: '2026-12-02', message: 'Juleturnering med gløgg' });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/calendar/${id}`, cookies });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/calendar' })).json()).toEqual([]);

    const again = await app.inject({ method: 'DELETE', url: `/api/calendar/${id}`, cookies });
    expect(again.statusCode).toBe(404);
  });

  it('is read-only for everyone else', async () => {
    const { id } = (await post('2026-11-04', 'Juleturnering')).json();
    const payload = { date: '2026-11-04', message: 'Hacket' };
    for (const response of [
      await app.inject({ method: 'POST', url: '/api/calendar', payload }),
      await app.inject({ method: 'PUT', url: `/api/calendar/${id}`, payload }),
      await app.inject({ method: 'DELETE', url: `/api/calendar/${id}` }),
    ]) {
      expect(response.statusCode).toBe(401);
    }
  });
});
