import { MEMBER_BONUS } from '@franks/core';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { memberships } from '../db/schema.js';
import { setMembership } from '../db/seasons.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
let cookies: { session: string };

beforeEach(async () => {
  await resetDb(db);
  setToday('2026-10-10');
  cookies = await loginAsAdmin(db);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const lastSeason = '2026-05-01';

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
      date: lastSeason,
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
    await addTournament(db, { date: lastSeason, placements: [[mads!.id, '1st']] });
    await db.insert(memberships).values([
      // Ann was a member last season, which doesn't count now.
      { playerId: ann!.id, start: '2026-01-01', end: '2026-05-31' },
      { playerId: mads!.id, start: '2026-01-01' },
    ]);

    const players = (await app.inject({ url: '/api/players' })).json();
    expect(players).toMatchObject([
      { name: 'ann', member: false, memberSince: null, seasonPoints: 7 },
      { name: 'Mads', member: true, memberSince: '2026-01-01', seasonPoints: 10 + MEMBER_BONUS },
    ]);
  });

  it('has no season points in the off-season', async () => {
    setToday('2026-06-15');
    await addPlayers(db, 'Mads');
    expect((await app.inject({ url: '/api/players' })).json()).toMatchObject([
      { name: 'Mads', seasonPoints: null },
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
    await setMembership(db, kent!.id, true);
    const byName = async () =>
      Object.fromEntries(
        (await app.inject({ url: '/api/players' }))
          .json()
          .map((p: { name: string; member: boolean }) => [p.name, p.member]),
      );
    expect(await byName()).toEqual({ A: false, B: false, Kent: true });
    expect((await app.inject({ url: `/api/players/${kent!.id}` })).json().member).toBe(true);
  });

  it('can make the new player a member', async () => {
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

  describe('membership', () => {
    const periods = async () =>
      (await db.select().from(memberships).orderBy(memberships.start)).map((m) => [m.start, m.end]);
    const patch = (id: number, payload: object) =>
      app.inject({ method: 'PATCH', url: `/api/players/${id}`, cookies, payload });

    it('starts today and ends today', async () => {
      const [player] = await addPlayers(db, 'Kent');
      expect((await patch(player!.id, { member: true })).json()).toMatchObject({
        member: true,
        memberSince: '2026-10-10',
        lastAdjusted: null,
      });
      expect((await patch(player!.id, { member: true })).json().member).toBe(true);
      setToday('2026-10-30');
      expect((await patch(player!.id, { member: false })).json()).toMatchObject({
        member: false,
        memberSince: null,
      });
      expect(await periods()).toEqual([['2026-10-10', '2026-10-30']]);
    });

    it('can be backdated, and moved', async () => {
      const [player] = await addPlayers(db, 'Kent');
      await patch(player!.id, { member: true, memberSince: '2026-09-03' });
      await patch(player!.id, { member: true, memberSince: '2026-08-01' });
      expect(await periods()).toEqual([['2026-08-01', null]]);
    });

    it('keeps history, and joins a rejoin onto a membership that just ended', async () => {
      const [player] = await addPlayers(db, 'Kent');
      await db.insert(memberships).values([
        { playerId: player!.id, start: '2025-01-01', end: '2025-03-01' },
        { playerId: player!.id, start: '2026-01-01', end: '2026-10-09' },
      ]);
      await patch(player!.id, { member: true });
      expect(await periods()).toEqual([
        ['2025-01-01', '2025-03-01'],
        ['2026-01-01', null],
      ]);
    });

    it('refuses a start date in the future or without member: true', async () => {
      const [player] = await addPlayers(db, 'Kent');
      const future = await patch(player!.id, { member: true, memberSince: '2026-10-11' });
      expect(future.statusCode).toBe(400);
      expect(future.json().error).toBe('member_since_in_future');
      const alone = await patch(player!.id, { memberSince: '2026-10-01' });
      expect(alone.json().error).toBe('member_since_without_member');
    });
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
