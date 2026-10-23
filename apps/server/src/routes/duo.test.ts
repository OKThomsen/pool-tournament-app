import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { Events } from '../events.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament, setToday } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const app = await buildApp({ db, logger: false, events: new Events() });
let cookies: { session: string };
/** Spiller 1–16: the teams are 1 & 9, 2 & 10, … 8 & 16. */
let firsts: number[];
let seconds: number[];

interface Match {
  id: number;
  stage: string;
  slot: string | null;
  poolId: number | null;
  playerAId: number | null;
  playerBId: number | null;
  raceTo: number | null;
}
interface Tournament {
  id: number;
  duo: boolean;
  players: { id: number; name: string; partner: { id: number; name: string } | null }[];
  pools: { id: number; playerIds: number[] }[];
  matches: Match[];
  results: { playerId: number; placement: string; points: number }[];
}

beforeEach(async () => {
  await resetDb(db);
  cookies = await loginAsAdmin(db);
  const created = await addPlayers(db, ...Array.from({ length: 16 }, (_, i) => `Spiller ${i + 1}`));
  firsts = created.slice(0, 8).map((p) => p.id);
  seconds = created.slice(8).map((p) => p.id);
  setToday('2026-10-19');
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const create = (payload: object) =>
  app.inject({
    method: 'POST',
    url: '/api/tournaments',
    cookies,
    payload: { date: '2026-10-19', format: '8-ball', ...payload },
  });

const duoTournament = async (extra: object = {}): Promise<Tournament> =>
  (await create({ playerIds: firsts, partnerIds: seconds, duo: true, ...extra })).json();

async function score(t: Tournament, match: Match, framesA: number, framesB: number) {
  if (match.raceTo === null) {
    await app.inject({
      method: 'PUT',
      url: `/api/tournaments/${t.id}/knockout/race`,
      cookies,
      payload: { stage: match.stage, raceTo: 2 },
    });
  }
  const response = await app.inject({
    method: 'PUT',
    url: `/api/tournaments/${t.id}/matches/${match.id}/result`,
    cookies,
    payload: { framesA, framesB },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as Tournament;
}

/**
 * Plays the duo tournament to the end, with semifinals: in every match the player listed first
 * in the pool (or player A in the knockout) wins 2-0. Returns it concluded.
 */
async function playThrough(t: Tournament): Promise<Tournament> {
  let latest: Tournament = (
    await app.inject({
      method: 'POST',
      url: `/api/tournaments/${t.id}/start`,
      cookies,
      payload: { raceTo: 2 },
    })
  ).json();
  for (const match of latest.matches.filter((m) => m.stage === 'pool')) {
    const ids = latest.pools.find((p) => p.id === match.poolId)!.playerIds;
    const aFirst = ids.indexOf(match.playerAId!) < ids.indexOf(match.playerBId!);
    latest = await score(latest, match, aFirst ? 2 : 0, aFirst ? 0 : 2);
  }
  latest = (
    await app.inject({
      method: 'POST',
      url: `/api/tournaments/${t.id}/knockout`,
      cookies,
      payload: { size: 4 },
    })
  ).json();
  for (const slot of ['SF1', 'SF2', 'THIRD', 'FINAL']) {
    latest = await score(
      latest,
      latest.matches.find((m) => m.slot === slot)!,
      2,
      0,
    );
  }
  const concluded = await app.inject({
    method: 'POST',
    url: `/api/tournaments/${t.id}/conclude`,
    cookies,
  });
  expect(concluded.statusCode).toBe(200);
  return concluded.json();
}

async function statsOf(playerId: number) {
  const players = (await app.inject({ url: '/api/players' })).json();
  return players.find((p: { id: number }) => p.id === playerId);
}

describe('Par turnering', () => {
  it('is created with teams: each entrant is the first player, with their partner', async () => {
    const t = await duoTournament();
    expect(t.duo).toBe(true);
    expect(t.players).toHaveLength(8);
    const team = t.players.find((p) => p.id === firsts[0])!;
    expect(team).toMatchObject({
      name: 'Spiller 1',
      partner: { id: seconds[0], name: 'Spiller 9' },
    });
    // 8 teams make two pools of 4, of teams.
    expect(t.pools.map((p) => p.playerIds.length)).toEqual([4, 4]);
    expect(t.pools.flatMap((p) => p.playerIds).sort()).toEqual([...firsts].sort());

    const single = await create({ playerIds: firsts });
    expect(single.statusCode).toBe(409); // one tournament in progress
  });

  it('refuses incomplete teams, a player in two teams, and partners without duo', async () => {
    const incomplete = await create({ playerIds: firsts, partnerIds: seconds.slice(1), duo: true });
    expect(incomplete.json()).toEqual({ error: 'incomplete_team' });
    const twice = await create({
      playerIds: firsts,
      partnerIds: [firsts[0], ...seconds.slice(1)],
      duo: true,
    });
    expect(twice.json()).toEqual({ error: 'player_in_two_teams' });
    const notDuo = await create({ playerIds: firsts, partnerIds: seconds });
    expect(notDuo.json()).toEqual({ error: 'partners_without_duo' });
    const tooFew = await create({
      playerIds: firsts.slice(0, 2),
      partnerIds: seconds.slice(0, 2),
      duo: true,
    });
    expect(tooFew.json()).toEqual({ error: 'too_few_players' });
  });

  it('can be "For sjov kamp" too', async () => {
    const t = await duoTournament({ forFun: true });
    expect(t).toMatchObject({ duo: true, forFun: true });
  });

  it('lets "Rediger spillere" swap partners and keeps duo unless it is sent', async () => {
    const t = await duoTournament();
    const edit = (payload: object) =>
      app.inject({
        method: 'PUT',
        url: `/api/tournaments/${t.id}`,
        cookies,
        payload: { date: '2026-10-19', format: '8-ball', ...payload },
      });
    const swapped = [seconds[1], seconds[0], ...seconds.slice(2)];
    const edited: Tournament = (await edit({ playerIds: firsts, partnerIds: swapped })).json();
    expect(edited.duo).toBe(true);
    expect(edited.players.find((p) => p.id === firsts[0])!.partner!.id).toBe(seconds[1]);
    expect(edited.players.find((p) => p.id === firsts[1])!.partner!.id).toBe(seconds[0]);
    // The teams stayed, so the pools did too.
    expect(edited.pools).toEqual(t.pools);

    // Back to a normal tournament: the 16 players on their own.
    const singles: Tournament = (
      await edit({ playerIds: [...firsts, ...seconds], duo: false })
    ).json();
    expect(singles.duo).toBe(false);
    expect(singles.players).toHaveLength(16);
    expect(singles.players.every((p) => p.partner === null)).toBe(true);
  });

  it('gives both players of every team the participation point, and nothing else', async () => {
    const done = await playThrough(await duoTournament());

    // The detail has one result per team, under its first player.
    expect(done.results).toHaveLength(8);
    expect(done.results.every((r) => r.points === 1)).toBe(true);
    const winner = done.results.find((r) => r.placement === '1st')!.playerId;
    const team = done.players.find((p) => p.id === winner)!;

    for (const id of [winner, team.partner!.id]) {
      expect(await statsOf(id)).toMatchObject({
        seasonPoints: 1,
        participation: 1,
        wins: 0,
        semifinals: 0,
        quarterfinals: 0,
      });
    }
    const { standings } = (await app.inject({ url: '/api/seasons/current' })).json();
    expect(standings).toHaveLength(16);
    expect(standings[0]).toMatchObject({ points: 1, participation: 1, wins: 0 });

    const list = (await app.inject({ url: '/api/tournaments' })).json();
    expect(list).toEqual([
      expect.objectContaining({
        id: done.id,
        duo: true,
        winner: `${team.name} & ${team.partner!.name}`,
        participants: 16,
      }),
    ]);
  });

  it('leaves handicap regulation alone', async () => {
    // Everyone won a normal tournament first: +1, so a 1st or 2nd here would recommend a change.
    await addTournament(db, {
      date: '2026-10-10',
      placements: [...firsts, ...seconds].map((id) => [id, '1st'] as [number, '1st']),
    });
    const done = await playThrough(await duoTournament());
    const winner = done.results.find((r) => r.placement === '1st')!.playerId;
    const regulation = (await app.inject({ url: `/api/handicaps/${winner}`, cookies })).json();
    expect(regulation.score).toBe(1);
    expect(regulation.history.map((step: { kind: string }) => step.kind)).toEqual(['tournament']);
    const players = (await app.inject({ url: '/api/handicaps', cookies })).json();
    expect(players.every((p: { pending: unknown[] }) => p.pending.length === 0)).toBe(true);
  });

  it('keeps a partner from being deleted', async () => {
    await duoTournament();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/players/${seconds[0]}`,
      cookies,
    });
    expect(response.statusCode).toBe(409);
  });
});
