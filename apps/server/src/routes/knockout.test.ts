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
  raceTo: number | null;
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
    await app.inject({
      method: 'POST',
      url: `/api/tournaments/${id}/start`,
      cookies,
      payload: { raceTo: 2 },
    })
  ).json();
}

function setRace(t: Tournament, stage: string, raceTo: number) {
  return app.inject({
    method: 'PUT',
    url: `/api/tournaments/${t.id}/knockout/race`,
    cookies,
    payload: { stage, raceTo },
  });
}

/**
 * Enters a result as the admin. For tests that don't care about race lengths, a round without
 * one first gets the race the score implies.
 */
async function score(t: Tournament, match: Match, framesA: number, framesB: number) {
  if (match.raceTo === null) await setRace(t, match.stage, Math.max(framesA, framesB));
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
    const response = await startKnockout(t, { size: 8 });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('pools_incomplete');
  });

  it('creates quarterfinals with players from different pools', async () => {
    const t = await playPools(await startedTournament());
    const response = await startKnockout(t, { size: 8 });
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
    // Every round's race length is chosen afterwards, the first round's included.
    expect(knockout.every((m) => m.raceTo === null)).toBe(true);
    const poolOf = (id: number) => k.pools.find((p) => p.playerIds.includes(id))!.name;
    for (const qf of knockout.filter((m) => m.stage === 'QF')) {
      expect(poolOf(qf.playerAId!)).not.toBe(poolOf(qf.playerBId!));
    }
    // Later rounds wait for their players.
    expect(bySlot(k, 'SF1')).toMatchObject({ playerAId: null, playerBId: null });
  });

  it('seeds the pool winners first and keeps each pool apart in the semifinals', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    const [poolA, poolB] = k.pools as [Tournament['pools'][0], Tournament['pools'][0]];
    // playPools makes each pool finish in draw order.
    const winners = [poolA.playerIds[0], poolB.playerIds[0]];
    const runnersUp = [poolA.playerIds[1], poolB.playerIds[1]];
    expect(k.seeds.slice(0, 2).sort()).toEqual(winners.sort());
    expect(k.seeds.slice(2).sort()).toEqual(runnersUp.sort());

    // Each pool winner meets the other pool's runner-up: 1v4 and 2v3, or 1v3 and 2v4 when 1v4
    // would be a pool against itself.
    const poolOf = (id: number) => k.pools.find((p) => p.playerIds.includes(id))!.name;
    for (const slot of ['SF1', 'SF2']) {
      const sf = bySlot(k, slot);
      expect(poolOf(sf.playerAId!)).not.toBe(poolOf(sf.playerBId!));
    }
    expect([bySlot(k, 'SF1').playerAId, bySlot(k, 'SF2').playerAId]).toEqual(k.seeds.slice(0, 2));
    expect(k.matches.some((m) => m.stage === 'QF')).toBe(false);
  });

  it('can only start once', async () => {
    const t = await playPools(await startedTournament());
    await startKnockout(t, { size: 4 });
    expect((await startKnockout(t, { size: 4 })).statusCode).toBe(409);
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

    const refused = await startKnockout(played, { size: 4 });
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
    const k: Tournament = (await startKnockout(played, { size: 4 })).json();
    // Top two of pool A: the first player and D, the admin's pick.
    expect(k.seeds).toContain(first);
    expect(k.seeds).toContain(d);
    expect(k.seeds).not.toContain(b);
  });
});

describe('race length per round', () => {
  /** A knockout with semifinals only, both semifinals' players known and no race length yet. */
  async function semifinals(): Promise<Tournament> {
    const t = await playPools(await startedTournament());
    return (await startKnockout(t, { size: 4 })).json();
  }

  it('is chosen for the first round before it can be played', async () => {
    let k = await semifinals();
    const sf1 = bySlot(k, 'SF1');
    const refused = await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${k.id}/matches/${sf1.id}/result`,
      cookies,
      payload: { framesA: 2, framesB: 0 },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('race_not_set');

    k = (await setRace(k, 'SF', 3)).json();
    expect(k.matches.filter((m) => m.stage === 'SF').map((m) => m.raceTo)).toEqual([3, 3]);
    expect((await score(k, bySlot(k, 'SF1'), 3, 2)).statusCode).toBe(200);
  });

  it('is chosen for each later round once its players are known', async () => {
    let k: Tournament = (
      await startKnockout(await playPools(await startedTournament()), { size: 8 })
    ).json();
    for (const slot of ['QF1', 'QF2', 'QF3', 'QF4'])
      k = (await score(k, bySlot(k, slot), 2, 0)).json();
    const sf1 = bySlot(k, 'SF1');
    const refused = await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${k.id}/matches/${sf1.id}/result`,
      cookies,
      payload: { framesA: 2, framesB: 0 },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('race_not_set');

    k = (await setRace(k, 'SF', 3)).json();
    expect(k.matches.filter((m) => m.stage === 'SF').map((m) => m.raceTo)).toEqual([3, 3]);
    expect((await score(k, bySlot(k, 'SF1'), 2, 0)).json().error).toBe('invalid_score');
    expect((await score(k, bySlot(k, 'SF1'), 3, 1)).statusCode).toBe(200);
  });

  it('is chosen separately for the third-place final and the final', async () => {
    let k = await semifinals();
    k = (await score(k, bySlot(k, 'SF1'), 2, 0)).json();
    k = (await score(k, bySlot(k, 'SF2'), 2, 0)).json();
    expect([bySlot(k, 'THIRD').raceTo, bySlot(k, 'FINAL').raceTo]).toEqual([null, null]);
    await setRace(k, 'THIRD', 2);
    k = (await setRace(k, 'FINAL', 4)).json();
    expect([bySlot(k, 'THIRD').raceTo, bySlot(k, 'FINAL').raceTo]).toEqual([2, 4]);
  });

  it('can be changed until the round has a result', async () => {
    let k = await semifinals();
    expect((await setRace(k, 'SF', 3)).statusCode).toBe(200);
    k = (await setRace(k, 'SF', 2)).json();
    k = (await score(k, bySlot(k, 'SF1'), 2, 1)).json();
    const refused = await setRace(k, 'SF', 3);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('round_started');
  });

  it('only exists for the rounds in the knockout, and only for admins', async () => {
    const k = await semifinals();
    expect((await setRace(k, 'QF', 2)).json().error).toBe('no_such_round');
    const anonymous = await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${k.id}/knockout/race`,
      payload: { stage: 'SF', raceTo: 3 },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('knockout results', () => {
  async function knockoutTournament(): Promise<Tournament> {
    const t = await playPools(await startedTournament());
    return (await startKnockout(t, { size: 8 })).json();
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

  it('allows a pool correction after the pools close only if the qualifiers stay the same', async () => {
    // Semifinals: the top two of each pool. Pools finished in draw order (first player best).
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    const [poolA] = k.pools;
    const [first, second, third] = poolA!.playerIds;
    const between = (a: number, b: number) =>
      k.matches.find(
        (m) =>
          m.stage === 'pool' &&
          ((m.playerAId === a && m.playerBId === b) || (m.playerAId === b && m.playerBId === a)),
      )!;

    // Same winner, closer score: nobody else qualifies.
    const fix = between(first!, second!);
    const fixed = await score(
      k,
      fix,
      fix.playerAId === first ? 2 : 1,
      fix.playerAId === first ? 1 : 2,
    );
    expect(fixed.statusCode).toBe(200);

    // The third player beating the second would put the third player through instead.
    const flip = between(second!, third!);
    const flipped = await score(
      k,
      flip,
      flip.playerAId === third ? 2 : 0,
      flip.playerAId === third ? 0 : 2,
    );
    expect(flipped.statusCode).toBe(409);
    expect(flipped.json().error).toBe('would_change_qualification');
  });
});

describe('concluding', () => {
  /** A semifinal-only tournament with the knockout played: SF1, SF2, third place, final. */
  async function finishedKnockout(): Promise<Tournament> {
    const t = await playPools(await startedTournament());
    let k: Tournament = (await startKnockout(t, { size: 4 })).json();
    for (const slot of ['SF1', 'SF2', 'THIRD', 'FINAL']) {
      k = (await score(k, bySlot(k, slot), 2, 0)).json();
    }
    return k;
  }

  const conclude = (t: Tournament) =>
    app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/conclude`, cookies });

  it('needs the final and the third-place final played', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    const response = await conclude(k);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('knockout_unfinished');
  });

  it('writes placements, points, pool wins and handicaps, and lists the tournament', async () => {
    const k = await finishedKnockout();
    const response = await conclude(k);
    expect(response.statusCode).toBe(200);
    const done = response.json();
    expect(done.status).toBe('concluded');

    const placing = (slot: string, side: 'playerAId' | 'playerBId') =>
      done.results.find((r: { playerId: number }) => r.playerId === bySlot(done, slot)[side]);
    expect(placing('FINAL', 'playerAId')).toMatchObject({ placement: '1st', points: 10 });
    expect(placing('FINAL', 'playerBId')).toMatchObject({ placement: '2nd', points: 7 });
    expect(placing('THIRD', 'playerAId')).toMatchObject({ placement: '3rd', points: 5 });
    expect(placing('THIRD', 'playerBId')).toMatchObject({ placement: '4th', points: 4 });
    expect(done.results).toHaveLength(8);
    expect(
      done.results.filter((r: { placement: string }) => r.placement === 'participation'),
    ).toHaveLength(4);
    // Pool winners won all 3 of their pool matches.
    const poolWinner = done.pools[0].playerIds[0];
    expect(
      done.results.find((r: { playerId: number }) => r.playerId === poolWinner).matchesWon,
    ).toBe(3);

    const list = (await app.inject({ url: '/api/tournaments' })).json();
    expect(list).toEqual([
      expect.objectContaining({
        id: k.id,
        participants: 8,
        format: '8-ball',
        winner: expect.any(String),
      }),
    ]);
    // The slot for a tournament in progress is free again.
    expect((await app.inject({ url: '/api/tournaments/ongoing' })).json().tournament).toBeNull();
  });

  it('rewrites placements when a concluded result is corrected', async () => {
    const k = await finishedKnockout();
    const done: Tournament & { results: { playerId: number; placement: string }[] } = (
      await conclude(k)
    ).json();
    const final = bySlot(done, 'FINAL');
    // The final's loser actually won.
    const corrected = (await score(done, final, 1, 2)).json();
    const winner = corrected.results.find((r: { placement: string }) => r.placement === '1st');
    expect(winner.playerId).toBe(final.playerBId);
    expect(corrected.status).toBe('concluded');
  });

  it('refuses to clear a result in a concluded tournament', async () => {
    const k = await finishedKnockout();
    await conclude(k);
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/tournaments/${k.id}/matches/${bySlot(k, 'FINAL').id}/result`,
      cookies,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('tournament_concluded');
  });

  it('reopens a concluded tournament for bigger corrections', async () => {
    const k = await finishedKnockout();
    await conclude(k);
    const response = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${k.id}/reopen`,
      cookies,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'knockout', results: [] });
    expect((await app.inject({ url: '/api/tournaments' })).json()).toEqual([]);
  });

  it('deletes a concluded tournament and takes its points and statistics with it', async () => {
    const k = await finishedKnockout();
    await conclude(k);
    const standings = async () =>
      (await app.inject({ url: '/api/seasons/2-2026' })).json().standings;
    expect(await standings()).toHaveLength(8);

    const url = `/api/tournaments/${k.id}`;
    expect((await app.inject({ method: 'DELETE', url, cookies })).statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/tournaments' })).json()).toEqual([]);
    expect(await standings()).toEqual([]);
    const players = (await app.inject({ url: '/api/players' })).json();
    for (const player of players) {
      expect(player).toMatchObject({ participation: 0, wins: 0, semifinals: 0, quarterfinals: 0 });
    }
    // Nothing ties the players to it any more, so they can be deleted too.
    const removePlayer = await app.inject({
      method: 'DELETE',
      url: `/api/players/${players[0].id}`,
      cookies,
    });
    expect(removePlayer.statusCode).toBe(204);
  });

  it('404s when deleting a tournament that does not exist', async () => {
    const url = '/api/tournaments/999999';
    expect((await app.inject({ method: 'DELETE', url, cookies })).statusCode).toBe(404);
  });

  it('lets players score the knockout, and retires the join code on concluding', async () => {
    const t = await playPools(await startedTournament());
    await startKnockout(t, { size: 4 });
    const k: Tournament = (await setRace(t, 'SF', 2)).json();
    const codeUrl = `/api/tournaments/${k.id}/code`;
    const code = (await app.inject({ url: codeUrl, cookies })).json().code;
    const joined = await app.inject({ method: 'POST', url: '/api/play/join', payload: { code } });
    const player = { player: joined.cookies.find((c) => c.name === 'player')!.value };
    const playerScore = (match: Match) =>
      app.inject({
        method: 'PUT',
        url: `/api/tournaments/${k.id}/matches/${match.id}/result`,
        cookies: player,
        payload: { framesA: 2, framesB: 1 },
      });

    expect((await playerScore(bySlot(k, 'SF1'))).statusCode).toBe(200);
    let done = k;
    for (const slot of ['SF2', 'THIRD', 'FINAL']) {
      done = (await score(done, bySlot(done, slot), 2, 0)).json();
    }
    await conclude(done);
    expect((await app.inject({ url: codeUrl, cookies })).json().code).toBeNull();
    // A concluded tournament can only be corrected by an admin.
    expect((await playerScore(bySlot(done, 'FINAL'))).statusCode).toBe(401);

    await app.inject({ method: 'POST', url: `/api/tournaments/${k.id}/reopen`, cookies });
    const reopenedCode = (await app.inject({ url: codeUrl, cookies })).json().code;
    expect(reopenedCode).toMatch(/^[0-9]{6}$/);
  });
});

describe('final only', () => {
  /** A started tournament with 5 players: one pool. */
  async function onePool(): Promise<Tournament> {
    const players = await addPlayers(db, ...'VWXYZ'.split(''));
    const created = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      cookies,
      payload: { date: '2026-10-07', format: '8-ball', playerIds: players.map((p) => p.id) },
    });
    const { id } = created.json();
    return (
      await app.inject({
        method: 'POST',
        url: `/api/tournaments/${id}/start`,
        cookies,
        payload: { raceTo: 2 },
      })
    ).json();
  }

  it('sends the pool winner and runner-up straight to the final', async () => {
    const t = await playPools(await onePool());
    const [first, second] = t.pools[0]!.playerIds;
    const response = await startKnockout(t, { size: 2 });
    expect(response.statusCode).toBe(200);
    const k: Tournament = response.json();
    const knockout = k.matches.filter((m) => m.stage !== 'pool');
    expect(knockout.map((m) => m.slot)).toEqual(['FINAL']);
    expect(bySlot(k, 'FINAL')).toMatchObject({ playerAId: first, playerBId: second });
    expect(k.seeds).toEqual([first, second]);
  });

  it('is only for a single pool', async () => {
    const t = await playPools(await startedTournament());
    const response = await startKnockout(t, { size: 2 });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('final_only_needs_one_pool');
  });

  it('places 3rd and 4th by the pool ranking when concluded', async () => {
    const t = await playPools(await onePool());
    const [first, second, third, fourth, fifth] = t.pools[0]!.playerIds;
    let k: Tournament = (await startKnockout(t, { size: 2 })).json();
    // The runner-up wins the final.
    k = (await score(k, bySlot(k, 'FINAL'), 0, 2)).json();
    const done = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${k.id}/conclude`,
      cookies,
    });
    expect(done.statusCode).toBe(200);
    const results: { playerId: number; placement: string; points: number }[] = done.json().results;
    const placing = Object.fromEntries(results.map((r) => [r.playerId, [r.placement, r.points]]));
    expect(placing).toEqual({
      [second!]: ['1st', 10],
      [first!]: ['2nd', 7],
      [third!]: ['3rd', 5],
      [fourth!]: ['4th', 4],
      [fifth!]: ['participation', 1],
    });

    // Nobody played a semifinal; only the winner's Wins goes up.
    const players: { id: number; wins: number; semifinals: number }[] = (
      await app.inject({ url: '/api/players' })
    ).json();
    expect(players.every((p) => p.semifinals === 0)).toBe(true);
    expect(players.find((p) => p.id === second)!.wins).toBe(1);
  });
});

describe('swapping players in the first round', () => {
  function swap(t: Tournament, playerId: number, otherId: number) {
    return app.inject({
      method: 'PUT',
      url: `/api/tournaments/${t.id}/knockout/swap`,
      cookies,
      payload: { playerId, otherId },
    });
  }

  it('swaps two players and keeps their seeds', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    const sf1 = bySlot(k, 'SF1');
    const sf2 = bySlot(k, 'SF2');
    const response = await swap(k, sf1.playerBId!, sf2.playerBId!);
    expect(response.statusCode).toBe(200);
    const after: Tournament = response.json();
    expect(bySlot(after, 'SF1')).toMatchObject({
      playerAId: sf1.playerAId,
      playerBId: sf2.playerBId,
    });
    expect(bySlot(after, 'SF2')).toMatchObject({
      playerAId: sf2.playerAId,
      playerBId: sf1.playerBId,
    });
    expect(after.seeds).toEqual(k.seeds);
  });

  it('brings in a player who did not qualify, in the seed of the one they replace', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    const outsider = t.pools.flatMap((p) => p.playerIds).find((id) => !k.seeds.includes(id))!;
    const replaced = bySlot(k, 'SF1').playerBId!;
    const seed = k.seeds.indexOf(replaced);
    const after: Tournament = (await swap(k, replaced, outsider)).json();
    expect(bySlot(after, 'SF1').playerBId).toBe(outsider);
    expect(after.seeds[seed]).toBe(outsider);
    expect(after.seeds).not.toContain(replaced);
  });

  it('carries the change into the later rounds', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 8 })).json();
    const qf1 = bySlot(k, 'QF1');
    const qf2 = bySlot(k, 'QF2');
    await score(k, qf1, 2, 0);
    // QF2's player A and QF3's player A change places; the newcomer to QF2 wins it.
    const incoming = bySlot(k, 'QF3').playerAId!;
    const swapped: Tournament = (await swap(k, qf2.playerAId!, incoming)).json();
    const played: Tournament = (await score(swapped, bySlot(swapped, 'QF2'), 2, 0)).json();
    expect(bySlot(played, 'SF1')).toMatchObject({
      playerAId: qf1.playerAId,
      playerBId: incoming,
    });
  });

  it('refuses to change a match that has a result', async () => {
    const t = await playPools(await startedTournament());
    const k: Tournament = (await startKnockout(t, { size: 8 })).json();
    const qf1 = bySlot(k, 'QF1');
    await score(k, qf1, 2, 0);
    const response = await swap(k, qf1.playerAId!, bySlot(k, 'QF2').playerAId!);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('match_played');
  });

  it('only takes players from this tournament, and only during the knockout', async () => {
    const t = await playPools(await startedTournament());
    expect((await swap(t, t.pools[0]!.playerIds[0]!, t.pools[1]!.playerIds[0]!)).json()).toEqual({
      error: 'not_in_knockout',
    });
    const k: Tournament = (await startKnockout(t, { size: 4 })).json();
    expect((await swap(k, k.seeds[0]!, 99999)).json()).toEqual({ error: 'unknown_player' });
  });
});
