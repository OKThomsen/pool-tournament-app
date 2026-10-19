import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { Events } from '../events.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false, events: new Events() });
let cookies: { session: string };
let playerIds: number[];

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
  const created = await addPlayers(db, ...Array.from({ length: 8 }, (_, i) => `Spiller ${i + 1}`));
  playerIds = created.map((p) => p.id);
  setToday('2026-10-19');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const setForFun = (id: number, forFun: boolean, auth = cookies) =>
  app.inject({
    method: 'PUT',
    url: `/api/tournaments/${id}/for-fun`,
    cookies: auth,
    payload: { forFun },
  });

/** A concluded quarterfinal tournament in season 2/2026: Spiller 1 wins, Spiller 5–8 are 5–8. */
const concluded = (date = '2026-10-10') =>
  addTournament(db, {
    date,
    placements: [
      [playerIds[0]!, '1st'],
      [playerIds[1]!, '2nd'],
      [playerIds[2]!, '3rd'],
      [playerIds[3]!, '4th'],
      ...playerIds.slice(4).map((id) => [id, '5-8'] as [number, '5-8']),
    ],
  });

async function statsOf(playerId: number) {
  const players = (await app.inject({ url: '/api/players' })).json();
  return players.find((p: { id: number }) => p.id === playerId);
}

async function standing(playerId: number) {
  const { standings } = (await app.inject({ url: '/api/seasons/current' })).json();
  return standings.find((s: { playerId: number }) => s.playerId === playerId);
}

describe('For sjov kamp', () => {
  it('is set when the tournament is created, and shows in the detail', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      cookies,
      payload: { date: '2026-10-19', format: '8-ball', playerIds, forFun: true },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ forFun: true, status: 'draft' });

    // Without the field, a new tournament counts.
    await app.inject({ method: 'DELETE', url: `/api/tournaments/${created.json().id}`, cookies });
    const plain = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      cookies,
      payload: { date: '2026-10-19', format: '8-ball', playerIds },
    });
    expect(plain.json().forFun).toBe(false);
  });

  it('is kept by "Rediger spillere" unless it is sent', async () => {
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/api/tournaments',
        cookies,
        payload: { date: '2026-10-19', format: '8-ball', playerIds, forFun: true },
      })
    ).json();
    const edit = (payload: object) =>
      app.inject({ method: 'PUT', url: `/api/tournaments/${id}`, cookies, payload });
    const base = { date: '2026-10-19', format: '9-ball', playerIds };
    expect((await edit(base)).json().forFun).toBe(true);
    expect((await edit({ ...base, forFun: false })).json().forFun).toBe(false);
  });

  it('leaves the tournament out of every statistic, and back in when switched off', async () => {
    await concluded('2026-10-03');
    const fun = await concluded();

    expect(await statsOf(playerIds[0]!)).toMatchObject({
      seasonPoints: 20,
      participation: 2,
      wins: 2,
      semifinals: 2,
      quarterfinals: 2,
    });

    expect((await setForFun(fun.id, true)).json().forFun).toBe(true);
    expect(await statsOf(playerIds[0]!)).toMatchObject({
      seasonPoints: 10,
      participation: 1,
      wins: 1,
      semifinals: 1,
      quarterfinals: 1,
    });
    expect(await standing(playerIds[0]!)).toMatchObject({
      points: 10,
      participation: 1,
      wins: 1,
      semifinals: 1,
      quarterfinals: 1,
    });
    expect(await statsOf(playerIds[4]!)).toMatchObject({ seasonPoints: 2, participation: 1 });

    await setForFun(fun.id, false);
    expect(await statsOf(playerIds[0]!)).toMatchObject({ seasonPoints: 20, participation: 2 });
  });

  it('keeps its placings and stays under Turneringer, marked', async () => {
    const fun = await concluded();
    await setForFun(fun.id, true);
    const detail = (await app.inject({ url: `/api/tournaments/${fun.id}` })).json();
    expect(detail.results).toHaveLength(8);
    expect(detail.results[0]).toMatchObject({ playerId: playerIds[0], placement: '1st' });
    const list = (await app.inject({ url: '/api/tournaments' })).json();
    expect(list).toEqual([
      expect.objectContaining({ id: fun.id, forFun: true, winner: 'Spiller 1' }),
    ]);
  });

  it('gives no one a place on the season standings or a season of its own', async () => {
    const fun = await concluded('2026-03-07');
    await setForFun(fun.id, true);
    const seasons = (await app.inject({ url: '/api/seasons' })).json();
    expect(seasons.map((s: { label: string }) => s.label)).toEqual(['2/2026']);
    const { standings } = (await app.inject({ url: '/api/seasons/1-2026' })).json();
    expect(standings).toEqual([]);
  });

  it('is admin-only, and not for old tournaments', async () => {
    const fun = await concluded();
    expect((await setForFun(fun.id, true, { session: 'nope' })).statusCode).toBe(401);
    expect((await setForFun(99999, true)).statusCode).toBe(404);

    const old = await app.inject({
      method: 'POST',
      url: '/api/tournaments/historical',
      cookies,
      payload: { date: '2026-09-12', format: '9-ball', knockoutSize: 4, playerIds },
    });
    const refused = await setForFun(old.json().id, true);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'historical' });
  });
});
