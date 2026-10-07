import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { players, results, seasons, tournamentPlayers, tournaments } from '../db/schema.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
let cookies: { session: string };

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function addPlayers(...names: string[]) {
  return db
    .insert(players)
    .values(names.map((name) => ({ name })))
    .returning();
}

/** A concluded tournament with the given placements. */
async function addTournament(knockoutSize: 4 | 8, placements: [number, string][]) {
  const [season] = await db
    .insert(seasons)
    .values({ label: '01/2026' })
    .onConflictDoNothing()
    .returning();
  const seasonId = season?.id ?? (await db.select().from(seasons))[0]!.id;
  const [tournament] = await db
    .insert(tournaments)
    .values({
      date: '2026-04-30',
      seasonId,
      week: 1,
      format: '8-ball',
      knockoutSize,
      status: 'concluded',
    })
    .returning();
  for (const [playerId, placement] of placements) {
    await db.insert(tournamentPlayers).values({ tournamentId: tournament!.id, playerId });
    await db.insert(results).values({
      tournamentId: tournament!.id,
      playerId,
      placement: placement as '1st',
      points: 0,
      matchesWon: 0,
      baseHandicap: 0,
      frameHandicap: 0,
    });
  }
}

describe('GET /api/players', () => {
  it('lists players by name with all-time statistics', async () => {
    const [mads, ann] = await addPlayers('Mads', 'ann');
    await addTournament(8, [
      [mads!.id, '1st'],
      [ann!.id, '5-8'],
    ]);
    await addTournament(4, [
      [mads!.id, '3rd'],
      [ann!.id, 'participation'],
    ]);

    const response = await app.inject({ url: '/api/players' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { name: 'ann', participation: 2, wins: 0, semifinals: 0, quarterfinals: 1 },
      // The semifinal-only tournament counts as a semifinal but not a quarterfinal.
      { name: 'Mads', participation: 2, wins: 1, semifinals: 2, quarterfinals: 1 },
    ]);
  });

  it('is public', async () => {
    await addPlayers('Mads');
    expect((await app.inject({ url: '/api/players' })).json()).toHaveLength(1);
  });
});

describe('GET /api/players/search', () => {
  it('matches the start of the name, ignoring case', async () => {
    await addPlayers('Mads', 'Martin Johansen', 'Emma', 'Ma_x');
    const search = async (q: string) =>
      (await app.inject({ url: `/api/players/search?q=${encodeURIComponent(q)}`, cookies }))
        .json()
        .map((p: { name: string }) => p.name);
    expect(await search('ma')).toEqual(['Ma_x', 'Mads', 'Martin Johansen']);
    expect(await search('MAR')).toEqual(['Martin Johansen']);
    // "_" is a literal underscore, not a wildcard.
    expect(await search('Ma_')).toEqual(['Ma_x']);
    expect(await search('  ')).toEqual([]);
  });

  it('is admin-only', async () => {
    expect((await app.inject({ url: '/api/players/search?q=M' })).statusCode).toBe(401);
  });
});

describe('POST /api/players', () => {
  it('creates a player', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/players',
      cookies,
      payload: { name: '  Prasad ', baseHandicap: -2 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Prasad', baseHandicap: -2, frameHandicap: 0 });
  });

  it('refuses a name that already exists in any capitalisation', async () => {
    await addPlayers('Prasad');
    const response = await app.inject({
      method: 'POST',
      url: '/api/players',
      cookies,
      payload: { name: 'prasad' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'name_taken' });
  });

  it('rejects a blank name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/players',
      cookies,
      payload: { name: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('is admin-only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: 'Prasad' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('PATCH /api/players/:id', () => {
  it('renames without touching the last adjusted date', async () => {
    const [player] = await addPlayers('Kent');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/players/${player!.id}`,
      cookies,
      payload: { name: 'Kent B' },
    });
    expect(response.json()).toMatchObject({ name: 'Kent B', lastAdjusted: null });
  });

  it('sets the last adjusted date when a handicap changes', async () => {
    const [player] = await addPlayers('Kent');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/players/${player!.id}`,
      cookies,
      payload: { frameHandicap: 2 },
    });
    expect(response.json().frameHandicap).toBe(2);
    expect(response.json().lastAdjusted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is 404 for an unknown player and admin-only', async () => {
    const unknown = await app.inject({
      method: 'PATCH',
      url: '/api/players/999',
      cookies,
      payload: { name: 'X' },
    });
    expect(unknown.statusCode).toBe(404);
    const [player] = await addPlayers('Kent');
    const anonymous = await app.inject({
      method: 'PATCH',
      url: `/api/players/${player!.id}`,
      payload: { name: 'X' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('DELETE /api/players/:id', () => {
  it('deletes a player who never played', async () => {
    const [player] = await addPlayers('Kent');
    const url = `/api/players/${player!.id}`;
    expect((await app.inject({ method: 'DELETE', url, cookies })).statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
  });

  it('keeps a player who has played, for the history', async () => {
    const [player] = await addPlayers('Kent');
    await addTournament(4, [[player!.id, 'participation']]);
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/players/${player!.id}`,
      cookies,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'player_has_tournaments' });
  });

  it('is admin-only', async () => {
    const [player] = await addPlayers('Kent');
    const response = await app.inject({ method: 'DELETE', url: `/api/players/${player!.id}` });
    expect(response.statusCode).toBe(401);
  });
});
