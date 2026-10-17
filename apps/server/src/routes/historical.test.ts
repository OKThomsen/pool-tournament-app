import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { Events } from '../events.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false, events: new Events() });
let cookies: { session: string };
let playerIds: number[];

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
  const created = await addPlayers(db, ...Array.from({ length: 10 }, (_, i) => `Spiller ${i + 1}`));
  playerIds = created.map((p) => p.id);
  setToday('2026-10-17');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** "Indtast gammel turnering", players best first. */
function enter(knockoutSize: number, ids = playerIds, date = '2026-09-12') {
  return app.inject({
    method: 'POST',
    url: '/api/tournaments/historical',
    cookies,
    payload: { date, format: '9-ball', knockoutSize, playerIds: ids },
  });
}

interface Result {
  playerId: number;
  placement: string;
  points: number;
  matchesWon: number;
}

const byPlayer = (results: Result[]) =>
  playerIds.map((id) => {
    const result = results.find((r) => r.playerId === id)!;
    return [result.placement, result.points];
  });

describe('POST /api/tournaments/historical', () => {
  it('saves a concluded tournament with placings from the order, quarterfinals', async () => {
    const response = await enter(8);
    expect(response.statusCode).toBe(201);
    const tournament = response.json();
    expect(tournament).toMatchObject({
      date: '2026-09-12',
      week: 37,
      season: '2/2026',
      format: '9-ball',
      status: 'concluded',
      knockoutSize: 8,
      historical: true,
      pools: [],
      matches: [],
      seeds: [],
    });
    expect(tournament.players).toHaveLength(10);
    expect(byPlayer(tournament.results)).toEqual([
      ['1st', 10],
      ['2nd', 7],
      ['3rd', 5],
      ['4th', 4],
      ['5-8', 2],
      ['5-8', 2],
      ['5-8', 2],
      ['5-8', 2],
      ['participation', 1],
      ['participation', 1],
    ]);
    expect(tournament.results.every((r: Result) => r.matchesWon === 0)).toBe(true);
  });

  it('has no 5–8 places with semifinals or the final only', async () => {
    for (const size of [4, 2]) {
      const tournament = (await enter(size, playerIds.slice(0, 6))).json();
      expect(tournament.results.map((r: Result) => [r.placement, r.points])).toEqual([
        ['1st', 10],
        ['2nd', 7],
        ['3rd', 5],
        ['4th', 4],
        ['participation', 1],
        ['participation', 1],
      ]);
    }
  });

  it('can be entered while another tournament is in progress', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      cookies,
      payload: { date: '2026-10-17', format: '8-ball', playerIds },
    });
    expect((await enter(4)).statusCode).toBe(201);
  });

  it('shows up under Turneringer, with the winner', async () => {
    const { id } = (await enter(4)).json();
    const list = (await app.inject({ url: '/api/tournaments' })).json();
    expect(list).toEqual([
      expect.objectContaining({ id, winner: 'Spiller 1', participants: 10, format: '9-ball' }),
    ]);
  });

  it('gives season points and counts in the players’ statistics', async () => {
    await enter(8);
    await enter(4, [playerIds[1]!, playerIds[0]!, ...playerIds.slice(2)], '2026-10-03');
    await enter(2, playerIds, '2026-07-04'); // off-season: no season points

    const standings = (await app.inject({ url: '/api/seasons/current' })).json().standings;
    const first = standings.find((s: { playerId: number }) => s.playerId === playerIds[0]);
    expect(first).toMatchObject({ points: 17, participation: 2, wins: 1, semifinals: 2 });

    const players = (await app.inject({ url: '/api/players' })).json();
    const stats = (id: number) => players.find((p: { id: number }) => p.id === id);
    // The final only doesn't count as reaching the semifinals.
    expect(stats(playerIds[0]!)).toMatchObject({
      seasonPoints: 17,
      participation: 3,
      wins: 2,
      semifinals: 2,
      quarterfinals: 1,
    });
    // 5–8 in the quarterfinals, participation in the other two.
    expect(stats(playerIds[4]!)).toMatchObject({
      seasonPoints: 3,
      participation: 3,
      wins: 0,
      semifinals: 0,
      quarterfinals: 1,
    });
  });

  it('needs every place filled', async () => {
    expect((await enter(8, playerIds.slice(0, 7))).json()).toEqual({
      error: 'too_few_players',
    });
    expect((await enter(4, playerIds.slice(0, 3))).statusCode).toBe(400);
    expect((await enter(2, playerIds.slice(0, 4))).statusCode).toBe(201);
  });

  it('refuses a date in the future, an unknown player and other knockout sizes', async () => {
    expect((await enter(4, playerIds, '2026-10-18')).json()).toEqual({ error: 'date_in_future' });
    expect((await enter(4, [...playerIds, 99999])).json()).toEqual({ error: 'unknown_player' });
    expect((await enter(6)).statusCode).toBe(400);
  });

  it('is admin-only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tournaments/historical',
      payload: { date: '2026-09-12', format: '8-ball', knockoutSize: 4, playerIds },
    });
    expect(response.statusCode).toBe(401);
  });

  it("can't be reopened, but can be deleted", async () => {
    const { id } = (await enter(4)).json();
    const reopen = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${id}/reopen`,
      cookies,
    });
    expect(reopen.statusCode).toBe(409);
    expect(reopen.json()).toEqual({ error: 'historical' });

    const remove = await app.inject({ method: 'DELETE', url: `/api/tournaments/${id}`, cookies });
    expect(remove.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/tournaments' })).json()).toEqual([]);
  });
});
