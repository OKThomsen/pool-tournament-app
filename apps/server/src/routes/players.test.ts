import { MEMBER_BONUS } from '@franks/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { currentSeason, setMembership } from '../db/seasons.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament } from '../test/fixtures.js';

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

const lastSeason = { label: '01/2000', start: '2000-01-01' };

describe('GET /api/players', () => {
  it('lists players by name with all-time statistics', async () => {
    const [mads, ann] = await addPlayers(db, 'Mads', 'ann');
    await addTournament(db, {
      placements: [
        [mads!.id, '1st'],
        [ann!.id, '5-8'],
      ],
    });
    await addTournament(db, {
      knockoutSize: 4,
      season: lastSeason,
      placements: [
        [mads!.id, '3rd'],
        [ann!.id, 'participation'],
      ],
    });

    const response = await app.inject({ url: '/api/players' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { name: 'ann', participation: 2, wins: 0, semifinals: 0, quarterfinals: 1 },
      // The semifinal-only tournament counts as a semifinal but not a quarterfinal.
      { name: 'Mads', participation: 2, wins: 1, semifinals: 2, quarterfinals: 1 },
    ]);
  });

  it("counts season points from this season's tournaments plus the member bonus", async () => {
    const [mads, ann] = await addPlayers(db, 'Mads', 'ann');
    await addTournament(db, {
      placements: [
        [mads!.id, '1st'],
        [ann!.id, '2nd'],
      ],
    });
    await addTournament(db, { season: lastSeason, placements: [[mads!.id, '1st']] });
    await setMembership(db, ann!.id, lastSeason.label, true);
    await setMembership(db, mads!.id, currentSeason().label, true);

    const players = (await app.inject({ url: '/api/players' })).json();
    expect(players).toMatchObject([
      // Ann was a member last season, which doesn't count now.
      { name: 'ann', member: false, seasonPoints: 7 },
      { name: 'Mads', member: true, seasonPoints: 10 + MEMBER_BONUS },
    ]);
  });

  it('is public', async () => {
    await addPlayers(db, 'Mads');
    expect((await app.inject({ url: '/api/players' })).json()).toHaveLength(1);
  });
});

describe('GET /api/players/search', () => {
  it('matches the start of the name, ignoring case', async () => {
    await addPlayers(db, 'Mads', 'Martin Johansen', 'Emma', 'Ma_x');
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

  it("reports membership correctly when the player's id differs from the season's", async () => {
    // Regression: an unqualified "id" in the membership subquery once matched the season's id.
    const [, , kent] = await addPlayers(db, 'A', 'B', 'Kent');
    await setMembership(db, kent!.id, currentSeason().label, true);
    const byName = async () =>
      Object.fromEntries(
        (await app.inject({ url: '/api/players' }))
          .json()
          .map((p: { name: string; member: boolean }) => [p.name, p.member]),
      );
    expect(await byName()).toEqual({ A: false, B: false, Kent: true });
    expect((await app.inject({ url: `/api/players/${kent!.id}` })).json().member).toBe(true);
  });

  it('can make the new player a member for this season', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/players',
      cookies,
      payload: { name: 'Prasad', member: true },
    });
    expect(response.json()).toMatchObject({ name: 'Prasad', member: true });
  });

  it('refuses a name that already exists in any capitalisation', async () => {
    await addPlayers(db, 'Prasad');
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
    const [player] = await addPlayers(db, 'Kent');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/players/${player!.id}`,
      cookies,
      payload: { name: 'Kent B' },
    });
    expect(response.json()).toMatchObject({ name: 'Kent B', lastAdjusted: null });
  });

  it("records and removes this season's membership", async () => {
    const [player] = await addPlayers(db, 'Kent');
    const patch = (member: boolean) =>
      app.inject({
        method: 'PATCH',
        url: `/api/players/${player!.id}`,
        cookies,
        payload: { member },
      });
    expect((await patch(true)).json()).toMatchObject({ member: true, lastAdjusted: null });
    expect((await patch(true)).json().member).toBe(true);
    expect((await patch(false)).json().member).toBe(false);
  });

  it('sets the last adjusted date when a handicap changes', async () => {
    const [player] = await addPlayers(db, 'Kent');
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
    const [player] = await addPlayers(db, 'Kent');
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
    const [player] = await addPlayers(db, 'Kent');
    const url = `/api/players/${player!.id}`;
    expect((await app.inject({ method: 'DELETE', url, cookies })).statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
  });

  it('keeps a player who has played, for the history', async () => {
    const [player] = await addPlayers(db, 'Kent');
    await addTournament(db, { knockoutSize: 4, placements: [[player!.id, 'participation']] });
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/players/${player!.id}`,
      cookies,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'player_has_tournaments' });
  });

  it('is admin-only', async () => {
    const [player] = await addPlayers(db, 'Kent');
    const response = await app.inject({ method: 'DELETE', url: `/api/players/${player!.id}` });
    expect(response.statusCode).toBe(401);
  });
});
