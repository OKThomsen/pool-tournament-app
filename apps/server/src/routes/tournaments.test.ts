import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
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
  const created = await addPlayers(db, ...Array.from({ length: 9 }, (_, i) => `Spiller ${i + 1}`));
  playerIds = created.map((p) => p.id);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function create(ids = playerIds, date = '2026-10-07') {
  return app.inject({
    method: 'POST',
    url: '/api/tournaments',
    cookies,
    payload: { date, format: '8-ball', playerIds: ids },
  });
}

describe('POST /api/tournaments', () => {
  it('creates a draft with the pools drawn', async () => {
    const response = await create();
    expect(response.statusCode).toBe(201);
    const tournament = response.json();
    expect(tournament).toMatchObject({
      date: '2026-10-07',
      week: 41,
      season: '04/2026',
      format: '8-ball',
      status: 'draft',
    });
    expect(tournament.players).toHaveLength(9);
    // 9 players: a pool of 5 and a pool of 4.
    expect(tournament.pools.map((p: { name: string; playerIds: number[] }) => p.name)).toEqual([
      'A',
      'B',
    ]);
    expect(tournament.pools.map((p: { playerIds: number[] }) => p.playerIds.length)).toEqual([
      5, 4,
    ]);
    expect(tournament.pools.flatMap((p: { playerIds: number[] }) => p.playerIds).sort()).toEqual(
      [...playerIds].sort(),
    );
    expect(tournament.matches).toEqual([]);
  });

  it('allows only one tournament in progress', async () => {
    await create();
    const second = await create();
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'tournament_in_progress' });
    expect((await app.inject({ url: '/api/tournaments/ongoing' })).json().tournament).toMatchObject(
      { status: 'draft' },
    );
  });

  it('needs at least 4 known players', async () => {
    expect((await create(playerIds.slice(0, 3))).json()).toEqual({ error: 'too_few_players' });
    expect((await create([...playerIds.slice(0, 4), 9999])).json()).toEqual({
      error: 'unknown_player',
    });
  });

  it('rejects a player listed twice', async () => {
    const response = await create([playerIds[0]!, ...playerIds.slice(0, 4)]);
    expect(response.statusCode).toBe(400);
  });

  it('is admin-only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: { date: '2026-10-07', format: '8-ball', playerIds },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('PUT /api/tournaments/:id/pools', () => {
  async function savePools(id: number, arrangement: number[][]) {
    return app.inject({
      method: 'PUT',
      url: `/api/tournaments/${id}/pools`,
      cookies,
      payload: { pools: arrangement },
    });
  }

  it("saves the admin's swaps and moves", async () => {
    const { id } = (await create()).json();
    const arrangement = [playerIds.slice(0, 3), playerIds.slice(3)];
    const response = await savePools(id, arrangement);
    expect(response.statusCode).toBe(200);
    expect(response.json().pools.map((p: { playerIds: number[] }) => p.playerIds)).toEqual(
      arrangement,
    );
  });

  it('requires every entrant exactly once', async () => {
    const { id } = (await create()).json();
    const missing = await savePools(id, [playerIds.slice(0, 4), playerIds.slice(4, 8)]);
    expect(missing.json()).toEqual({ error: 'players_mismatch' });
    const stranger = await savePools(id, [playerIds.slice(0, 4), [...playerIds.slice(5), 9999]]);
    expect(stranger.json()).toEqual({ error: 'players_mismatch' });
  });

  it('refuses a pool of one', async () => {
    const { id } = (await create()).json();
    const response = await savePools(id, [playerIds.slice(0, 8), playerIds.slice(8)]);
    expect(response.json()).toEqual({ error: 'pool_too_small' });
  });

  it('only works before the tournament starts', async () => {
    const { id } = (await create()).json();
    await app.inject({ method: 'POST', url: `/api/tournaments/${id}/start`, cookies });
    const response = await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)]);
    expect(response.statusCode).toBe(409);
  });
});

describe('POST /api/tournaments/:id/start', () => {
  it('creates every pool match in play order and starts the pools', async () => {
    const { id } = (await create()).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${id}/start`,
      cookies,
    });
    const tournament = response.json();
    expect(tournament.status).toBe('pools');
    // Pool of 5: 10 matches. Pool of 4: 6 matches.
    expect(tournament.matches).toHaveLength(16);
    const [poolA] = tournament.pools;
    const poolAMatches = tournament.matches.filter(
      (m: { poolId: number }) => m.poolId === poolA.id,
    );
    expect(poolAMatches.map((m: { scheduleOrder: number }) => m.scheduleOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(poolAMatches.every((m: { stage: string; raceTo: number }) => m.stage === 'pool')).toBe(
      true,
    );
    expect(poolAMatches[0]).toMatchObject({ raceTo: 2, framesA: null, framesB: null });
  });

  it('can only start once', async () => {
    const { id } = (await create()).json();
    const start = () =>
      app.inject({ method: 'POST', url: `/api/tournaments/${id}/start`, cookies });
    await start();
    expect((await start()).statusCode).toBe(409);
  });
});

describe('DELETE /api/tournaments/:id', () => {
  it('cancels a tournament in progress, freeing the slot', async () => {
    const { id } = (await create()).json();
    const response = await app.inject({ method: 'DELETE', url: `/api/tournaments/${id}`, cookies });
    expect(response.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/tournaments/ongoing' })).json()).toEqual({
      tournament: null,
    });
    expect((await create()).statusCode).toBe(201);
  });

  it('is admin-only', async () => {
    const { id } = (await create()).json();
    const response = await app.inject({ method: 'DELETE', url: `/api/tournaments/${id}` });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/tournaments/:id', () => {
  it('is public and 404s for unknown ids', async () => {
    const { id } = (await create()).json();
    expect((await app.inject({ url: `/api/tournaments/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/tournaments/9999' })).statusCode).toBe(404);
  });
});
