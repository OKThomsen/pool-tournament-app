import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { Events, type ChangeEvent } from '../events.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers } from '../test/fixtures.js';
import { tournaments } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const { db, pool } = createTestDb();
const events = new Events();
const app = await buildApp({ db, logger: false, events });
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

function savePools(id: number, arrangement: number[][]) {
  return app.inject({
    method: 'PUT',
    url: `/api/tournaments/${id}/pools`,
    cookies,
    payload: { pools: arrangement },
  });
}

/** "Gå til turnering". */
function start(id: number) {
  return app.inject({ method: 'POST', url: `/api/tournaments/${id}/start`, cookies });
}

function setPoolRace(id: number, poolId: number, raceTo: number) {
  return app.inject({
    method: 'PUT',
    url: `/api/tournaments/${id}/pools/${poolId}/race`,
    cookies,
    payload: { raceTo },
  });
}

/** Player A wins the match, in a race to `raceTo`. */
function score(id: number, matchId: number, raceTo = 2) {
  return app.inject({
    method: 'PUT',
    url: `/api/tournaments/${id}/matches/${matchId}/result`,
    cookies,
    payload: { framesA: raceTo, framesB: 0 },
  });
}

type Nine = [number, number, number, number, number, number, number, number, number];

interface Match {
  id: number;
  poolId: number | null;
  playerAId: number | null;
  playerBId: number | null;
  raceTo: number | null;
  framesA: number | null;
}

function matchBetween(tournament: { matches: Match[] }, a: number, b: number) {
  return tournament.matches.find(
    (m) => (m.playerAId === a && m.playerBId === b) || (m.playerAId === b && m.playerBId === a),
  )!;
}

describe('POST /api/tournaments', () => {
  it('creates a draft with the pools drawn', async () => {
    const response = await create();
    expect(response.statusCode).toBe(201);
    const tournament = response.json();
    expect(tournament).toMatchObject({
      date: '2026-10-07',
      week: 41,
      season: '2/2026',
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

  it('saves a pool of one, but the tournament cannot start with it', async () => {
    const { id } = (await create()).json();
    const response = await savePools(id, [playerIds.slice(0, 8), playerIds.slice(8)]);
    expect(response.statusCode).toBe(200);
    expect((await start(id)).json()).toEqual({ error: 'pool_too_small' });
    await savePools(id, [playerIds]);
    expect((await start(id)).statusCode).toBe(200);
  });

  it('refuses an empty pool', async () => {
    const { id } = (await create()).json();
    const response = await savePools(id, [playerIds, []]);
    expect(response.statusCode).toBe(400);
  });

  it('adds and removes pools, naming them A, B, C … in order', async () => {
    const { id } = (await create()).json();
    const three = (
      await savePools(id, [playerIds.slice(0, 3), playerIds.slice(3, 6), playerIds.slice(6)])
    ).json();
    expect(three.pools.map((p: { name: string }) => p.name)).toEqual(['A', 'B', 'C']);
    const two = (await savePools(id, [playerIds.slice(0, 3), playerIds.slice(3)])).json();
    expect(two.pools.map((p: { name: string }) => p.name)).toEqual(['A', 'B']);
  });

  it('keeps a pool with its results and race length when a pool before it is removed', async () => {
    const { id } = (await create()).json();
    const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = playerIds as Nine;
    await savePools(id, [
      [p1, p2, p3],
      [p4, p5, p6],
      [p7, p8, p9],
    ]);
    const started = (await start(id)).json();
    const poolC = started.pools[2];
    await setPoolRace(id, poolC.id, 3);
    const played = matchBetween(started, p7, p8);
    await score(id, played.id, 3);

    // Pool B's players go to A and C, so B is removed and C becomes B.
    const after = (
      await savePools(id, [
        [p1, p2, p3, p4],
        [p7, p8, p9, p5, p6],
      ])
    ).json();
    expect(after.pools.map((p: { id: number; name: string }) => [p.id, p.name])).toEqual([
      [started.pools[0].id, 'A'],
      [poolC.id, 'B'],
    ]);
    expect(after.pools[1].raceTo).toBe(3);
    expect(matchBetween(after, p7, p8)).toMatchObject({ id: played.id, framesA: 3 });
    expect(after.matches).toHaveLength(6 + 10);
  });

  it('gives a new pool the race length of the pool before it', async () => {
    const { id } = (await create()).json();
    const { pools } = (await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)])).json();
    await setPoolRace(id, pools[1].id, 4);
    const after = (
      await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5, 8), playerIds.slice(8)])
    ).json();
    expect(after.pools.map((p: { raceTo: number }) => p.raceTo)).toEqual([2, 4, 4]);
  });

  it('keeps the pool ids, and results while both players stay in the pool', async () => {
    const { id } = (await create()).json();
    await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)]);
    const started = (await start(id)).json();
    const [poolA, poolB] = started.pools;
    const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = playerIds as Nine;
    // One result between two players who stay in pool A, one with p5, who moves to pool B.
    const staying = matchBetween(started, p1, p2);
    const moving = matchBetween(started, p1, p5);
    await score(id, staying.id);
    await score(id, moving.id);

    const response = await savePools(id, [
      [p1, p2, p3, p4],
      [p6, p7, p8, p9, p5],
    ]);
    expect(response.statusCode).toBe(200);
    const after = response.json();
    expect(after.pools.map((p: { id: number }) => p.id)).toEqual([poolA.id, poolB.id]);
    expect(matchBetween(after, p1, p2)).toMatchObject({ id: staying.id, framesA: 2 });
    expect(matchBetween(after, p1, p5)).toBeUndefined();
    // Pool A of 4 has 6 matches, pool B of 5 has 10, and p5 plays everyone in pool B.
    expect(after.matches).toHaveLength(16);
    expect(matchBetween(after, p5!, p6!)).toMatchObject({ poolId: poolB.id, framesA: null });
  });

  it('only works until the knockout starts', async () => {
    const { id } = (await create()).json();
    await db.update(tournaments).set({ status: 'knockout' }).where(eq(tournaments.id, id));
    const response = await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)]);
    expect(response.json()).toEqual({ error: 'pools_closed' });
  });
});

describe('PUT /api/tournaments/:id', () => {
  function edit(id: number, ids: number[], date = '2026-10-08', format = '9-ball') {
    return app.inject({
      method: 'PUT',
      url: `/api/tournaments/${id}`,
      cookies,
      payload: { date, format, playerIds: ids },
    });
  }

  it('changes the date and format', async () => {
    const { id } = (await create()).json();
    const response = await edit(id, playerIds, '2026-10-14');
    expect(response.json()).toMatchObject({ date: '2026-10-14', week: 42, format: '9-ball' });
  });

  it('puts a latecomer into the smallest pool and keeps the rest of the pools', async () => {
    const [late] = await addPlayers(db, 'Sen');
    const { id } = (await create()).json();
    await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)]);
    const response = await edit(id, [...playerIds, late!.id]);
    expect(response.json().pools.map((p: { playerIds: number[] }) => p.playerIds)).toEqual([
      playerIds.slice(0, 5),
      [...playerIds.slice(5), late!.id],
    ]);
    expect(response.json().players).toHaveLength(10);
  });

  it('takes out a player who leaves, with their matches, during the pools', async () => {
    const { id } = (await create()).json();
    await savePools(id, [playerIds.slice(0, 5), playerIds.slice(5)]);
    const started = (await start(id)).json();
    const [p1, p2, p3] = playerIds as Nine;
    const kept = matchBetween(started, p2, p3);
    await score(id, matchBetween(started, p1, p2).id);
    await score(id, kept.id);

    const after = (await edit(id, playerIds.slice(1))).json();
    expect(after.players.map((p: { id: number }) => p.id)).not.toContain(p1);
    expect(after.pools[0].playerIds).toEqual(playerIds.slice(1, 5));
    expect(after.matches.some((m: Match) => m.playerAId === p1 || m.playerBId === p1)).toBe(false);
    expect(matchBetween(after, p2, p3)).toMatchObject({ id: kept.id, framesA: 2 });
    // Two pools of 4: 6 + 6 matches.
    expect(after.matches).toHaveLength(12);
  });

  it('draws the pools again when the player count needs another number of pools', async () => {
    const extra = await addPlayers(db, 'Sen 1', 'Sen 2', 'Sen 3');
    const { id } = (await create()).json();
    const started = (await start(id)).json();
    await score(id, started.matches[0].id);
    // 9 → 12 players is 4 + 4 + 4.
    const after = (await edit(id, [...playerIds, ...extra.map((p) => p.id)])).json();
    expect(after.pools.map((p: { playerIds: number[] }) => p.playerIds.length)).toEqual([4, 4, 4]);
    expect(after.matches.every((m: Match) => m.framesA === null)).toBe(true);
    expect(after.matches).toHaveLength(6 + 6 + 6);
  });

  it('needs at least 4 known players', async () => {
    const { id } = (await create()).json();
    expect((await edit(id, playerIds.slice(0, 3))).json()).toEqual({ error: 'too_few_players' });
    expect((await edit(id, [...playerIds, 9999])).json()).toEqual({ error: 'unknown_player' });
  });

  it('only works until the knockout starts', async () => {
    const { id } = (await create()).json();
    await db.update(tournaments).set({ status: 'knockout' }).where(eq(tournaments.id, id));
    expect((await edit(id, playerIds)).json()).toEqual({ error: 'pools_closed' });
  });
});

describe('POST /api/tournaments/:id/randomize', () => {
  const randomize = (id: number) =>
    app.inject({ method: 'POST', url: `/api/tournaments/${id}/randomize`, cookies });

  it("draws the pools again and starts the pool matches over, keeping each pool's race", async () => {
    const { id, pools } = (await create()).json();
    await setPoolRace(id, pools[0].id, 3);
    const started = (await start(id)).json();
    const poolA = started.matches.filter((m: Match) => m.poolId === pools[0].id);
    await score(id, poolA[0].id, 3);
    const response = await randomize(id);
    expect(response.statusCode).toBe(200);
    const after = response.json();
    expect(after.status).toBe('pools');
    expect(after.pools.map((p: { playerIds: number[] }) => p.playerIds.length)).toEqual([5, 4]);
    expect(after.matches).toHaveLength(16);
    expect(after.matches.every((m: Match) => m.framesA === null)).toBe(true);
    const raceOf = (poolId: number) =>
      new Set(after.matches.filter((m: Match) => m.poolId === poolId).map((m: Match) => m.raceTo));
    expect(raceOf(pools[0].id)).toEqual(new Set([3]));
    expect(raceOf(pools[1].id)).toEqual(new Set([2]));
  });

  it('works in the draft too', async () => {
    const { id } = (await create()).json();
    const after = (await randomize(id)).json();
    expect(after.status).toBe('draft');
    expect(after.matches).toEqual([]);
  });
});

describe('PUT /api/tournaments/:id/pools/:poolId/race', () => {
  it("sets a pool's race length in the draft, used when the pools start", async () => {
    const { id, pools } = (await create()).json();
    const set = await setPoolRace(id, pools[1].id, 3);
    expect(set.json().pools.map((p: { raceTo: number }) => p.raceTo)).toEqual([2, 3]);
    const started = (await start(id)).json();
    for (const match of started.matches as Match[]) {
      expect(match.raceTo).toBe(match.poolId === pools[1].id ? 3 : 2);
    }
  });

  it("changes a pool's race length until that pool has a result", async () => {
    const { id, pools } = (await create()).json();
    const started = (await start(id)).json();
    const inA = started.matches.find((m: Match) => m.poolId === pools[0].id);
    await score(id, inA.id);
    expect((await setPoolRace(id, pools[0].id, 3)).json()).toEqual({ error: 'round_started' });
    const changed = (await setPoolRace(id, pools[1].id, 4)).json();
    const poolB = changed.matches.filter((m: Match) => m.poolId === pools[1].id);
    expect(poolB.every((m: Match) => m.raceTo === 4)).toBe(true);
  });

  it('only accepts a race to 2–5, for a pool of this tournament', async () => {
    const { id, pools } = (await create()).json();
    expect((await setPoolRace(id, pools[0].id, 1)).statusCode).toBe(400);
    expect((await setPoolRace(id, pools[0].id, 6)).statusCode).toBe(400);
    expect((await setPoolRace(id, 99999, 3)).statusCode).toBe(404);
  });
});

describe('POST /api/tournaments/:id/start', () => {
  it('creates every pool match in play order and starts the pools', async () => {
    const { id } = (await create()).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${id}/start`,
      cookies,
      payload: { raceTo: 2 },
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
      app.inject({
        method: 'POST',
        url: `/api/tournaments/${id}/start`,
        cookies,
        payload: { raceTo: 2 },
      });
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

describe('match results', () => {
  /** A started tournament and its first pool match. */
  async function started() {
    const { id } = (await create()).json();
    const tournament = (
      await app.inject({
        method: 'POST',
        url: `/api/tournaments/${id}/start`,
        cookies,
        payload: { raceTo: 2 },
      })
    ).json();
    return { id, match: tournament.matches[0] as { id: number } };
  }

  const url = (id: number, matchId: number) => `/api/tournaments/${id}/matches/${matchId}/result`;
  const score = (id: number, matchId: number, framesA: number, framesB: number) =>
    app.inject({ method: 'PUT', url: url(id, matchId), cookies, payload: { framesA, framesB } });

  it('enters, corrects and clears a result', async () => {
    const { id, match } = await started();
    const entered = await score(id, match.id, 2, 1);
    expect(entered.statusCode).toBe(200);
    expect(entered.json().matches[0]).toMatchObject({ framesA: 2, framesB: 1 });

    const corrected = await score(id, match.id, 0, 2);
    expect(corrected.json().matches[0]).toMatchObject({ framesA: 0, framesB: 2 });

    const cleared = await app.inject({ method: 'DELETE', url: url(id, match.id), cookies });
    expect(cleared.json().matches[0]).toMatchObject({ framesA: null, framesB: null });
  });

  it.each([
    [1, 1],
    [1, 0],
    [3, 0],
    [2, 2],
  ])('rejects %i-%i, which is not a finished race to 2', async (a, b) => {
    const { id, match } = await started();
    const response = await score(id, match.id, a, b);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_score' });
  });

  it("404s for an unknown match or another tournament's match", async () => {
    const { id, match } = await started();
    expect((await score(id, 999_999, 2, 0)).statusCode).toBe(404);
    expect((await score(id + 1, match.id, 2, 0)).statusCode).toBe(404);
  });

  it('is admin-only', async () => {
    const { id, match } = await started();
    const response = await app.inject({
      method: 'PUT',
      url: url(id, match.id),
      payload: { framesA: 2, framesB: 0 },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('live updates', () => {
  it('announces every change to a tournament', async () => {
    const seen: ChangeEvent[] = [];
    const unsubscribe = events.subscribe((event) => seen.push(event));
    const { id } = (await create()).json();
    const tournament = (
      await app.inject({
        method: 'POST',
        url: `/api/tournaments/${id}/start`,
        cookies,
        payload: { raceTo: 2 },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${id}/matches/${tournament.matches[0].id}/result`,
      cookies,
      payload: { framesA: 2, framesB: 0 },
    });
    await app.inject({ method: 'DELETE', url: `/api/tournaments/${id}`, cookies });
    unsubscribe();
    // Created, started, scored, cancelled.
    expect(seen).toEqual(Array(4).fill({ tournamentId: id }));
  });

  it('streams changes as Server-Sent Events', async () => {
    const live = await buildApp({ db, logger: false });
    const address = await live.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    try {
      const response = await fetch(`${address}/api/events`, { signal: controller.signal });
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let received = '';
      const read = async () => (received += decoder.decode((await reader.read()).value));
      await read();
      // Vite serves the frontend in development, so there is no build to version.
      expect(received).toContain('event: hello\ndata: {"version":"dev"}');

      const created = await live.inject({
        method: 'POST',
        url: '/api/tournaments',
        cookies,
        payload: { date: '2026-10-07', format: '8-ball', playerIds },
      });
      while (!received.includes('event: tournament')) await read();
      expect(received).toContain(`data: {"tournamentId":${created.json().id}}`);
    } finally {
      controller.abort();
      await live.close();
    }
  });
});
