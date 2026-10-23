import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { players, results } from '../db/schema.js';
import { Events } from '../events.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false, events: new Events() });
let cookies: { session: string };
let august: number;
let oskar: number;

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
  const created = await addPlayers(db, 'August', 'Oskar');
  [august, oskar] = created.map((p) => p.id) as [number, number];
  setToday('2026-10-23');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A tournament where August finishes `placement` and Oskar takes part. */
function augustFinishes(placement: '1st' | '2nd' | 'participation', date: string, poolWins = 1) {
  return addTournament(db, {
    date,
    placements: [
      [august, placement, poolWins],
      [oskar, '3rd', 2],
    ],
  });
}

async function detail(id = august) {
  const response = await app.inject({ method: 'GET', url: `/api/handicaps/${id}`, cookies });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function resolve(tournamentId: number, action: 'apply' | 'dismiss', id = august) {
  return app.inject({
    method: 'POST',
    url: `/api/handicaps/${id}/recommendations/${tournamentId}`,
    cookies,
    payload: { action },
  });
}

describe('GET /api/handicaps', () => {
  it('is for admins only', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/handicaps' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/handicaps/${august}` })).statusCode).toBe(
      401,
    );
  });

  it('lists every player with their score and pending recommendations', async () => {
    await augustFinishes('1st', '2026-10-07');
    const second = await augustFinishes('2nd', '2026-10-14');
    await augustFinishes('participation', '2026-10-21', 0);

    const response = await app.inject({ method: 'GET', url: '/api/handicaps', cookies });
    expect(response.json()).toEqual([
      {
        id: august,
        name: 'August',
        baseHandicap: 0,
        frameHandicap: 0,
        lastAdjusted: null,
        // A new count started after the recommendation.
        score: -1,
        expires: '2026-12-21',
        pending: [
          {
            tournamentId: second.id,
            date: '2026-10-14',
            direction: 'harder',
            next: { base: -1, frame: 0 },
          },
        ],
      },
      expect.objectContaining({ id: oskar, score: 0, expires: null, pending: [] }),
    ]);
  });

  it('shows each tournament with the handicap and score at the time, newest first', async () => {
    const first = await augustFinishes('1st', '2026-10-07');
    const second = await augustFinishes('participation', '2026-10-14', 0);
    // Concluding takes these snapshots; the fixture stores 0.
    await db.update(results).set({ baseHandicap: 2 }).where(eq(results.tournamentId, first.id));
    await db.update(results).set({ baseHandicap: 1 }).where(eq(results.tournamentId, second.id));

    expect((await detail()).history).toEqual([
      expect.objectContaining({
        kind: 'tournament',
        tournamentId: second.id,
        date: '2026-10-14',
        placement: 'participation',
        poolWins: 0,
        baseHandicap: 1,
        frameHandicap: 0,
        change: -1,
        score: 0,
      }),
      expect.objectContaining({
        tournamentId: first.id,
        placement: '1st',
        baseHandicap: 2,
        change: 1,
        score: 1,
        recommendation: null,
      }),
    ]);
  });

  it('shows a ±1 running out', async () => {
    await augustFinishes('1st', '2026-08-19');
    expect(await detail()).toMatchObject({
      score: 0,
      expires: null,
      history: [{ kind: 'expired', date: '2026-10-19', score: 0 }, { kind: 'tournament' }],
    });
  });

  it("leaves out fun tournaments and counts old ones' finals only", async () => {
    await addTournament(db, { date: '2026-10-07', forFun: true, placements: [[august, '1st']] });
    await addTournament(db, {
      date: '2026-10-14',
      historical: true,
      placements: [[august, 'participation']],
    });
    expect(await detail()).toMatchObject({ score: 0, history: [{ change: 0, poolWins: null }] });

    await addTournament(db, {
      date: '2026-10-21',
      historical: true,
      placements: [[august, '2nd']],
    });
    expect((await detail()).score).toBe(1);
  });

  it('is 404 for an unknown player', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/handicaps/999', cookies });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/handicaps/:id/recommendations/:tournamentId', () => {
  it('applies a recommendation: one step on the ladder, score back to 0', async () => {
    await db.update(players).set({ baseHandicap: -4 }).where(eq(players.id, august));
    await augustFinishes('1st', '2026-10-07');
    const second = await augustFinishes('1st', '2026-10-14');
    await augustFinishes('participation', '2026-10-21', 0);

    const response = await resolve(second.id, 'apply');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      baseHandicap: -4,
      frameHandicap: -1,
      lastAdjusted: '2026-10-23',
      score: 0,
      pending: [],
      history: [
        {
          kind: 'reset',
          reason: 'applied',
          tournamentId: second.id,
          date: '2026-10-23',
          oldBase: -4,
          oldFrame: 0,
          newBase: -4,
          newFrame: -1,
        },
        { kind: 'tournament' },
        { kind: 'tournament' },
        { kind: 'tournament' },
      ],
    });

    expect((await resolve(second.id, 'apply')).json()).toEqual({ error: 'not_pending' });
  });

  it('dismisses a recommendation without changing the handicap', async () => {
    await augustFinishes('participation', '2026-10-14', 0);
    const second = await augustFinishes('participation', '2026-10-21', 0);
    const response = await resolve(second.id, 'dismiss');
    expect(response.json()).toMatchObject({
      baseHandicap: 0,
      lastAdjusted: null,
      score: 0,
      pending: [],
      history: [{ kind: 'reset', reason: 'dismissed', oldBase: 0, newBase: 0 }, {}, {}],
    });
  });

  it("can't apply past the end of the ladder, only dismiss", async () => {
    await db.update(players).set({ baseHandicap: 3 }).where(eq(players.id, august));
    await augustFinishes('participation', '2026-10-14', 0);
    const second = await augustFinishes('participation', '2026-10-21', 0);
    expect((await detail()).pending).toEqual([expect.objectContaining({ next: null })]);

    const response = await resolve(second.id, 'apply');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'handicap_at_limit' });
    expect((await resolve(second.id, 'dismiss')).statusCode).toBe(200);
  });

  it('is 409 for a tournament without a pending recommendation', async () => {
    const tournament = await augustFinishes('1st', '2026-10-14');
    expect((await resolve(tournament.id, 'apply')).statusCode).toBe(409);
  });

  it('is for admins only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/handicaps/${august}/recommendations/1`,
      payload: { action: 'apply' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('changing a handicap by hand', () => {
  it('sets the score back to 0 and records the change', async () => {
    await augustFinishes('1st', '2026-10-21');
    expect((await detail()).score).toBe(1);

    await app.inject({
      method: 'PATCH',
      url: `/api/players/${august}`,
      cookies,
      payload: { baseHandicap: -1 },
    });
    expect(await detail()).toMatchObject({
      score: 0,
      lastAdjusted: '2026-10-23',
      history: [{ kind: 'reset', reason: 'manual', oldBase: 0, newBase: -1 }, {}],
    });
  });

  it("doesn't count edits that leave the handicap as it is", async () => {
    await augustFinishes('1st', '2026-10-21');
    await app.inject({
      method: 'PATCH',
      url: `/api/players/${august}`,
      cookies,
      payload: { name: 'August B', baseHandicap: 0 },
    });
    expect((await detail()).score).toBe(1);
  });
});
