import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { tournaments } from '../db/schema.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
let cookies: { session: string };
let playerIds: number[];

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
  const created = await addPlayers(db, ...Array.from({ length: 8 }, (_, i) => `Spiller ${i + 1}`));
  playerIds = created.map((p) => p.id);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

interface Tournament {
  id: number;
  pools: { id: number; playerIds: number[] }[];
  matches: { id: number }[];
}

/** A draft tournament (pools drawn, not started). */
async function draft(): Promise<Tournament> {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      cookies,
      payload: { date: '2026-10-07', format: '8-ball', playerIds },
    })
  ).json();
}

async function started(): Promise<Tournament> {
  const { id } = await draft();
  return (
    await app.inject({ method: 'POST', url: `/api/tournaments/${id}/start`, cookies })
  ).json();
}

async function codeOf(id: number): Promise<string> {
  return (await app.inject({ url: `/api/tournaments/${id}/code`, cookies })).json().code;
}

const join = (code: string) =>
  app.inject({ method: 'POST', url: '/api/play/join', payload: { code } });

/** Joins with the tournament's code and returns the player's cookies. */
async function joinAsPlayer(id: number): Promise<{ player: string }> {
  const response = await join(await codeOf(id));
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === 'player')!;
  return { player: cookie.value };
}

const resultUrl = (id: number, matchId: number) =>
  `/api/tournaments/${id}/matches/${matchId}/result`;

describe('join code', () => {
  it('is made when the tournament is created, and only admins see it', async () => {
    const t = await draft();
    expect(await codeOf(t.id)).toMatch(/^[0-9]{6}$/);
    expect((await app.inject({ url: `/api/tournaments/${t.id}/code` })).statusCode).toBe(401);
    const detail = await app.inject({ url: `/api/tournaments/${t.id}` });
    expect(detail.body).not.toContain(await codeOf(t.id));
  });

  it('can be replaced, which signs out the players', async () => {
    const t = await started();
    const old = await codeOf(t.id);
    const player = await joinAsPlayer(t.id);
    const replaced = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${t.id}/code`,
      cookies,
    });
    expect(replaced.json().code).not.toBe(old);
    expect((await join(old)).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/play/me', cookies: player })).statusCode).toBe(401);
  });
});

describe('POST /api/play/join', () => {
  it('joins the tournament in progress', async () => {
    const t = await draft();
    const player = await joinAsPlayer(t.id);
    const me = await app.inject({ url: '/api/play/me', cookies: player });
    expect(me.json()).toEqual({ tournamentId: t.id });
  });

  it('refuses a wrong or malformed code', async () => {
    const t = await draft();
    const wrong = String((Number(await codeOf(t.id)) + 1) % 1_000_000).padStart(6, '0');
    expect((await join(wrong)).json()).toEqual({ error: 'unknown_code' });
    expect((await join('12345')).statusCode).toBe(400);
    expect((await join('abcdef')).statusCode).toBe(400);
  });

  it('ends when the tournament is concluded or cancelled', async () => {
    const t = await draft();
    const player = await joinAsPlayer(t.id);
    await db.update(tournaments).set({ status: 'concluded' }).where(eq(tournaments.id, t.id));
    expect((await app.inject({ url: '/api/play/me', cookies: player })).statusCode).toBe(401);

    const next = await draft();
    const nextPlayer = await joinAsPlayer(next.id);
    await app.inject({ method: 'DELETE', url: `/api/tournaments/${next.id}`, cookies });
    expect((await app.inject({ url: '/api/play/me', cookies: nextPlayer })).statusCode).toBe(401);
  });

  it('can be left again', async () => {
    const t = await draft();
    const player = await joinAsPlayer(t.id);
    const left = await app.inject({ method: 'POST', url: '/api/play/leave', cookies: player });
    expect(left.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/play/me', cookies: player })).statusCode).toBe(401);
  });
});

describe('scoring as a player', () => {
  it('enters, corrects and clears a pool result', async () => {
    const t = await started();
    const player = await joinAsPlayer(t.id);
    const match = t.matches[0]!;
    const put = (framesA: number, framesB: number) =>
      app.inject({
        method: 'PUT',
        url: resultUrl(t.id, match.id),
        cookies: player,
        payload: { framesA, framesB },
      });
    expect((await put(2, 1)).json().matches[0]).toMatchObject({ framesA: 2, framesB: 1 });
    expect((await put(0, 2)).json().matches[0]).toMatchObject({ framesA: 0, framesB: 2 });
    const cleared = await app.inject({
      method: 'DELETE',
      url: resultUrl(t.id, match.id),
      cookies: player,
    });
    expect(cleared.json().matches[0]).toMatchObject({ framesA: null, framesB: null });
  });

  it("can't score another tournament", async () => {
    const t = await started();
    const player = await joinAsPlayer(t.id);
    const response = await app.inject({
      method: 'PUT',
      url: resultUrl(t.id + 1, t.matches[0]!.id),
      cookies: player,
      payload: { framesA: 2, framesB: 0 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('can do nothing else', async () => {
    const t = await draft();
    const player = await joinAsPlayer(t.id);
    const base = `/api/tournaments/${t.id}`;
    const attempts = [
      { method: 'PUT', url: `${base}/pools`, payload: { pools: t.pools.map((p) => p.playerIds) } },
      { method: 'POST', url: `${base}/start` },
      { method: 'POST', url: `${base}/knockout`, payload: { size: 4, raceTo: 2 } },
      {
        method: 'PUT',
        url: `${base}/pools/${t.pools[0]!.id}/tiebreak`,
        payload: { playerIds: t.pools[0]!.playerIds.slice(0, 2) },
      },
      { method: 'POST', url: `${base}/conclude` },
      { method: 'POST', url: `${base}/reopen` },
      { method: 'GET', url: `${base}/code` },
      { method: 'POST', url: `${base}/code` },
      { method: 'DELETE', url: base },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, cookies: player });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(401);
    }
  });
});
