import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false });
let cookies: { session: string };

interface Match {
  id: number;
  stage: string;
  slot: string | null;
  poolId: number | null;
  playerAId: number | null;
  playerBId: number | null;
  raceTo: number;
  framesA: number | null;
}
interface Tournament {
  id: number;
  status: string;
  pools: { id: number; name: string; playerIds: number[] }[];
  matches: Match[];
  seeds: number[];
}

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A started tournament with 8 players: two pools of 4. */
async function startedTournament(): Promise<Tournament> {
  const players = await addPlayers(db, ...'ABCDEFGH'.split(''));
  const created = await app.inject({
    method: 'POST',
    url: '/api/tournaments',
    cookies,
    payload: { date: '2026-10-07', format: '8-ball', playerIds: players.map((p) => p.id) },
  });
  const { id } = created.json();
  return (
    await app.inject({ method: 'POST', url: `/api/tournaments/${id}/start`, cookies })
  ).json();
}

async function score(t: Tournament, match: Match, framesA: number, framesB: number) {
  return app.inject({
    method: 'PUT',
    url: `/api/tournaments/${t.id}/matches/${match.id}/result`,
    cookies,
    payload: { framesA, framesB },
  });
}

/**
 * Plays every pool match. By default the player drawn earlier in the pool wins 2-0, so each pool
 * finishes in draw order with no ties.
 */
async function playPools(t: Tournament, decide?: (m: Match, pool: number[]) => [number, number]) {
  let latest = t;
  for (const match of t.matches.filter((m) => m.stage === 'pool')) {
    const poolIds = t.pools.find((p) => p.id === match.poolId)!.playerIds;
    const [a, b] =
      decide?.(match, poolIds) ??
      (poolIds.indexOf(match.playerAId!) < poolIds.indexOf(match.playerBId!) ? [2, 0] : [0, 2]);
    latest = (await score(t, match, a, b)).json();
  }
  return latest;
}

function startKnockout(t: Tournament, payload: object) {
  return app.inject({
    method: 'POST',
    url: `/api/tournaments/${t.id}/knockout`,
    cookies,
    payload,
  });
}

const bySlot = (t: Tournament, slot: string) => t.matches.find((m) => m.slot === slot)!;

describe('POST /api/tournaments/:id/knockout', () => {
  it('waits until every pool match is played', async () => {
    const t = await startedTournament();
    const response = await startKnockout(t, { size: 8, raceTo: 2 });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('pools_incomplete');
  });

  it('creates quarterfinals with players from different pools', async () => {
    const t = await playPools(await startedTournament());
    const response = await startKnockout(t, { size: 8, raceTo: 3 });
    expect(response.statusCode).toBe(200);
    const k: Tournament = response.json();
    expect(k.status).toBe('knockout');
    expect(k.seeds).toHaveLength(8);

    const knockout = k.matches.filter((m) => m.stage !== 'pool');
    expect(knockout.map((m) => m.slot)).toEqual([
      'QF1',
      'QF2',
      'QF3',
      'QF4',
      'SF1',
      'SF2',
      'THIRD',
      'FINAL',
    ]);
    expect(knockout.every((m) => m.raceTo === 3)).toBe(true);
    const poolOf = (id: number) => k.pools.find((p) => p.playerIds.includes(id))!.name;
    for (const qf of knockout.filter((m) => m.stage === 'QF')) {
      expect(poolOf(qf.playerAId!)).not.toBe(poolOf(qf.playerBId!));
    }
    // Later rounds wait for their players.
    expect(bySlot(k, 'SF1')).toMatchObject({ playerAId: null, playerBId: null });
  });

  it('seeds a semifinal-only knockout 1v4 and 2v3', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4, raceTo: 2 })).json();
    const [s1, s2, s3, s4] = k.seeds;
    expect(bySlot(k, 'SF1')).toMatchObject({ playerAId: s1, playerBId: s4 });
    expect(bySlot(k, 'SF2')).toMatchObject({ playerAId: s2, playerBId: s3 });
    expect(k.matches.some((m) => m.stage === 'QF')).toBe(false);
  });

  it('can only start once', async () => {
    const t = await playPools(await startedTournament());
    await startKnockout(t, { size: 4, raceTo: 2 });
    expect((await startKnockout(t, { size: 4, raceTo: 2 })).statusCode).toBe(409);
  });

  it('asks the admin to settle a pool tie at the cut-off, then uses their order', async () => {
    const t = await startedTournament();
    const [poolA] = t.pools;
    const [first, b, c, d] = poolA!.playerIds;
    // In pool A the first player beats everyone 2-1, and the other three beat each other in a
    // circle 2-1: one win and a set score of -1 each, so results can't separate them.
    const beats: [number, number][] = [
      [b!, c!],
      [c!, d!],
      [d!, b!],
    ];
    const played = await playPools(t, (m, ids) => {
      if (m.poolId !== poolA!.id) {
        return ids.indexOf(m.playerAId!) < ids.indexOf(m.playerBId!) ? [2, 0] : [0, 2];
      }
      const aWins =
        m.playerAId === first || beats.some(([w, l]) => w === m.playerAId && l === m.playerBId);
      return aWins ? [2, 1] : [1, 2];
    });

    const refused = await startKnockout(played, { size: 4, raceTo: 2 });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('unresolved_ties');
    expect(refused.json().ties[0].sort()).toEqual([b, c, d].sort());

    const tiebreak = await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${t.id}/pools/${poolA!.id}/tiebreak`,
      cookies,
      payload: { playerIds: [d, b, c] },
    });
    expect(tiebreak.statusCode).toBe(200);
    const k: Tournament = (await startKnockout(played, { size: 4, raceTo: 2 })).json();
    // Top two of pool A: the first player and D, the admin's pick.
    expect(k.seeds).toContain(first);
    expect(k.seeds).toContain(d);
    expect(k.seeds).not.toContain(b);
  });
});

describe('knockout results', () => {
  async function knockoutTournament(): Promise<Tournament> {
    const t = await playPools(await startedTournament());
    return (await startKnockout(t, { size: 8, raceTo: 2 })).json();
  }

  async function play(t: Tournament, slot: string, aWins = true) {
    const match = bySlot(t, slot);
    return (await score(t, match, aWins ? 2 : 0, aWins ? 0 : 2)).json() as Tournament;
  }

  it('sends winners on and semifinal losers to the third-place final', async () => {
    let k = await knockoutTournament();
    for (const slot of ['QF1', 'QF2', 'QF3', 'QF4']) k = await play(k, slot);
    expect(bySlot(k, 'SF1')).toMatchObject({
      playerAId: bySlot(k, 'QF1').playerAId,
      playerBId: bySlot(k, 'QF2').playerAId,
    });
    k = await play(k, 'SF1');
    k = await play(k, 'SF2', false);
    expect(bySlot(k, 'FINAL')).toMatchObject({
      playerAId: bySlot(k, 'SF1').playerAId,
      playerBId: bySlot(k, 'SF2').playerBId,
    });
    expect(bySlot(k, 'THIRD')).toMatchObject({
      playerAId: bySlot(k, 'SF1').playerBId,
      playerBId: bySlot(k, 'SF2').playerAId,
    });
  });

  it('refuses a match whose players are not decided yet', async () => {
    const k = await knockoutTournament();
    const response = await score(k, bySlot(k, 'SF1'), 2, 0);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('players_not_decided');
  });

  it('protects later results when a winner changes', async () => {
    let k = await knockoutTournament();
    for (const slot of ['QF1', 'QF2']) k = await play(k, slot);
    k = await play(k, 'SF1');

    // Changing who won QF1 would change SF1's players, which already has a result.
    const flip = await score(k, bySlot(k, 'QF1'), 0, 2);
    expect(flip.statusCode).toBe(409);
    expect(flip.json().error).toBe('later_match_played');
    // Same winner, different score: fine.
    expect((await score(k, bySlot(k, 'QF1'), 2, 1)).statusCode).toBe(200);

    // Clear SF1 first, then the QF1 winner can change and SF1 gets the new player.
    await app.inject({
      method: 'DELETE',
      url: `/api/tournaments/${k.id}/matches/${bySlot(k, 'SF1').id}/result`,
      cookies,
    });
    const changed: Tournament = (await score(k, bySlot(k, 'QF1'), 0, 2)).json();
    expect(bySlot(changed, 'SF1').playerAId).toBe(bySlot(changed, 'QF1').playerBId);
  });

  it('closes the pools once the knockout has started', async () => {
    const k = await knockoutTournament();
    const poolMatch = k.matches.find((m) => m.stage === 'pool')!;
    const response = await score(k, poolMatch, 0, 2);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('stage_closed');
  });
});
