import { MEMBER_BONUS } from '@franks/core';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { memberships } from '../db/schema.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });

const autumn = { label: '2/2026', start: '2026-09-01', end: '2026-12-31' };
const spring2027 = { label: '1/2027', start: '2027-01-01', end: '2027-05-31' };

beforeEach(async () => {
  await resetDb(db);
  setToday('2026-10-10');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const current = async () => (await app.inject({ url: '/api/seasons/current' })).json();

describe('GET /api/seasons/current', () => {
  it('describes the current season and the next', async () => {
    const response = await app.inject({ url: '/api/seasons/current' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ season: autumn, next: spring2027, standings: [] });
  });

  it('has no season in the off-season, only the next one', async () => {
    setToday('2026-07-01');
    const [mads] = await addPlayers(db, 'Mads');
    // A summer tournament gives no season points.
    await addTournament(db, { placements: [[mads!.id, '1st']] });
    expect(await current()).toEqual({ season: null, next: autumn, standings: [] });
  });

  it("ranks this season's players by points, including the member bonus", async () => {
    // Idle neither played nor earns the bonus, so they are left out.
    const [mads, ann, kent, sarah, idle] = await addPlayers(
      db,
      'Mads',
      'Ann',
      'Kent',
      'Sarah',
      'Idle',
    );
    await addTournament(db, {
      placements: [
        [mads!.id, '1st'],
        [ann!.id, '2nd'],
        [kent!.id, '5-8'],
      ],
    });
    await addTournament(db, {
      knockoutSize: 4,
      placements: [
        [ann!.id, '1st'],
        [kent!.id, 'participation'],
      ],
    });
    // Last season's results and summer tournaments don't count.
    await addTournament(db, { date: '2026-05-20', placements: [[sarah!.id, '1st']] });
    await addTournament(db, { date: '2026-08-20', placements: [[sarah!.id, '1st']] });
    await db.insert(memberships).values([
      // A member since before the season, who hasn't played yet, gets the bonus and shows up.
      { playerId: sarah!.id, start: '2026-03-01' },
      // Joined in the season's second month: too late for the bonus.
      { playerId: idle!.id, start: '2026-10-01' },
    ]);

    const { standings } = await current();
    // Sarah's bonus (10) equals Mads' win, so they share second place (by name within it).
    expect(MEMBER_BONUS).toBe(10);
    expect(standings).toEqual([
      expect.objectContaining({
        rank: 1,
        name: 'Ann',
        points: 17,
        participation: 2,
        wins: 1,
        semifinals: 2,
        quarterfinals: 1,
      }),
      expect.objectContaining({ rank: 2, name: 'Mads', points: 10, wins: 1, member: false }),
      expect.objectContaining({ rank: 2, name: 'Sarah', points: MEMBER_BONUS, member: true }),
      expect.objectContaining({ rank: 4, name: 'Kent', points: 3, semifinals: 0 }),
    ]);
  });

  it('gives the bonus only for a membership that covers the whole season', async () => {
    const names = ['Early', 'LastDay', 'Late', 'Left', 'Stayed'];
    const added = await addPlayers(db, ...names);
    const id = (name: string) => added[names.indexOf(name)]!.id;
    await db.insert(memberships).values([
      { playerId: id('Early'), start: '2026-09-01' },
      { playerId: id('LastDay'), start: '2026-09-30' },
      { playerId: id('Late'), start: '2026-10-01' },
      // Left in October: no bonus, even though they were a member when the season started.
      { playerId: id('Left'), start: '2026-01-01', end: '2026-10-05' },
      { playerId: id('Stayed'), start: '2026-01-01', end: '2026-12-31' },
    ]);
    const { standings } = await current();
    expect(standings.map((s: { name: string }) => s.name)).toEqual(['Early', 'LastDay', 'Stayed']);
  });

  it('gives players level on points the same rank', async () => {
    const [a, b, c] = await addPlayers(db, 'A', 'B', 'C');
    await addTournament(db, {
      placements: [
        [a!.id, 'participation'],
        [b!.id, 'participation'],
        [c!.id, '5-8'],
      ],
    });
    const { standings } = await current();
    expect(standings.map((s: { name: string; rank: number }) => [s.name, s.rank])).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 2],
    ]);
  });
});
