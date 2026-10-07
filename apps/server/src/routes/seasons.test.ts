import { MEMBER_BONUS } from '@franks/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { currentSeason, setMembership } from '../db/seasons.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const lastSeason = { label: '01/2000', start: '2000-01-01' };

describe('GET /api/seasons/current', () => {
  it('describes the current season', async () => {
    const response = await app.inject({ url: '/api/seasons/current' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...currentSeason(), standings: [] });
  });

  it("ranks this season's players by points, including the member bonus", async () => {
    // Idle neither played nor is a member, so they are left out.
    const [mads, ann, kent, sarah] = await addPlayers(db, 'Mads', 'Ann', 'Kent', 'Sarah', 'Idle');
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
    // Last season's results don't count.
    await addTournament(db, { season: lastSeason, placements: [[sarah!.id, '1st']] });
    // A member who hasn't played yet still gets the bonus and shows up.
    await setMembership(db, sarah!.id, currentSeason().label, true);

    const { standings } = (await app.inject({ url: '/api/seasons/current' })).json();
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
      expect.objectContaining({ rank: 2, name: 'Mads', points: 10, wins: 1 }),
      expect.objectContaining({ rank: 2, name: 'Sarah', points: MEMBER_BONUS, participation: 0 }),
      expect.objectContaining({ rank: 4, name: 'Kent', points: 3, semifinals: 0 }),
    ]);
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
    const { standings } = (await app.inject({ url: '/api/seasons/current' })).json();
    expect(standings.map((s: { name: string; rank: number }) => [s.name, s.rank])).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 2],
    ]);
  });
});
