import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { tournaments } from '../db/schema.js';
import { loginAsAdmin } from '../test/auth.js';
import { createTestDb, resetDb } from '../test/database.js';
import { addPlayers, addTournament } from '../test/fixtures.js';

const { db, pool } = createTestDb();
const photoDir = await mkdtemp(join(tmpdir(), 'franks-photos-test-'));
const app = await buildApp({ db, logger: false, photoDir });
let cookies: { session: string };

beforeEach(async () => {
  await resetDb(db);
  await rm(photoDir, { recursive: true, force: true });
  await mkdir(join(photoDir, 'thumbs'), { recursive: true });
  cookies = await loginAsAdmin(db);
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await rm(photoDir, { recursive: true, force: true });
});

// Only the first bytes are looked at, to tell the image type.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6]);

interface Details {
  date: string;
  tournamentId: number | null;
  playerIds: number[];
}

function upload(
  details: Partial<Details> = {},
  {
    image = JPEG,
    thumb = JPEG,
    auth = true,
  }: { image?: Buffer; thumb?: Buffer; auth?: boolean } = {},
) {
  const form = new FormData();
  form.append('image', new Blob([image]), 'photo.jpg');
  form.append('thumb', new Blob([thumb]), 'thumb.jpg');
  form.append(
    'data',
    JSON.stringify({
      date: '2026-10-28',
      tournamentId: null,
      playerIds: [],
      width: 4032,
      height: 3024,
      ...details,
    }),
  );
  return app.inject({
    method: 'POST',
    url: '/api/photos',
    cookies: auth ? cookies : {},
    payload: form,
  });
}

function edit(id: number, details: Details) {
  return app.inject({ method: 'PUT', url: `/api/photos/${id}`, cookies, payload: details });
}

const list = async () => (await app.inject({ url: '/api/photos' })).json();

/** A concluded tournament with Anna, Bo and Carl on the podium and David in 4th. */
async function tournamentWithPodium(date = '2026-10-21') {
  const [anna, bo, carl, david] = await addPlayers(db, 'Anna', 'Bo', 'Carl', 'David');
  const tournament = await addTournament(db, {
    date,
    placements: [
      [anna!.id, '1st'],
      [bo!.id, '2nd'],
      [carl!.id, '3rd'],
      [david!.id, '4th'],
    ],
  });
  return { tournament, anna: anna!, bo: bo!, carl: carl!, david: david! };
}

describe('photos', () => {
  it('stores an upload and serves the original and the thumbnail', async () => {
    const [eva] = await addPlayers(db, 'Eva');
    const response = await upload({ playerIds: [eva!.id] }, { image: PNG });
    expect(response.statusCode).toBe(201);
    const photo = response.json();
    expect(photo).toEqual({
      id: photo.id,
      date: '2026-10-28',
      width: 4032,
      height: 3024,
      season: '2/2026',
      tournament: null,
      placed: [],
      tagged: [{ id: eva!.id, name: 'Eva' }],
    });

    const image = await app.inject({ url: `/api/photos/${photo.id}/image` });
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(image.rawPayload).toEqual(PNG);
    const thumb = await app.inject({ url: `/api/photos/${photo.id}/thumb` });
    expect(thumb.headers['content-type']).toBe('image/jpeg');
    expect(thumb.rawPayload).toEqual(JPEG);
  });

  it('lists the newest first, with an off-season photo in no season', async () => {
    await upload({ date: '2026-07-15' });
    await upload({ date: '2027-01-02' });
    await upload({ date: '2026-10-28' });
    expect(
      (await list()).map((p: { date: string; season: string | null }) => [p.date, p.season]),
    ).toEqual([
      ['2027-01-02', '1/2027'],
      ['2026-10-28', '2/2026'],
      ['2026-07-15', null],
    ]);
  });

  it("ties a winner picture to a tournament, with the tournament's top three", async () => {
    const { tournament, anna, bo, carl, david } = await tournamentWithPodium('2026-08-26');
    // Taken on the night, but saved after midnight in September: the tournament's season counts.
    const photo = (
      await upload({ date: '2026-09-02', tournamentId: tournament.id, playerIds: [david.id] })
    ).json();
    expect(photo).toMatchObject({
      season: null,
      tournament: {
        id: tournament.id,
        date: '2026-08-26',
        format: '8-ball',
        duo: false,
        forFun: false,
      },
      placed: [
        { playerId: anna.id, name: 'Anna', placement: '1st' },
        { playerId: bo.id, name: 'Bo', placement: '2nd' },
        { playerId: carl.id, name: 'Carl', placement: '3rd' },
      ],
      tagged: [{ id: david.id, name: 'David' }],
    });
  });

  it('keeps one winner picture per tournament: tying another unties the first', async () => {
    const { tournament } = await tournamentWithPodium();
    const first = (await upload({ tournamentId: tournament.id })).json();
    const second = (await upload()).json();
    const tied = await edit(second.id, {
      date: '2026-10-21',
      tournamentId: tournament.id,
      playerIds: [],
    });
    expect(tied.json().tournament.id).toBe(tournament.id);
    const photos = await list();
    expect(photos.find((p: { id: number }) => p.id === first.id).tournament).toBeNull();
    expect(photos).toHaveLength(2);
  });

  it('only ties concluded tournaments', async () => {
    const [ongoing] = await db
      .insert(tournaments)
      .values({ date: '2026-10-28', week: 44, format: '9-ball', status: 'pools' })
      .returning();
    expect((await upload({ tournamentId: ongoing!.id })).json()).toEqual({
      error: 'tournament_not_concluded',
    });
    expect((await upload({ tournamentId: 999 })).json()).toEqual({ error: 'unknown_tournament' });
    expect((await upload({ playerIds: [999] })).json()).toEqual({ error: 'unknown_player' });
  });

  it('edits the date and the tags, and unties', async () => {
    const { tournament, anna, bo } = await tournamentWithPodium();
    const photo = (await upload({ tournamentId: tournament.id, playerIds: [anna.id] })).json();
    const edited = await edit(photo.id, {
      date: '2026-10-01',
      tournamentId: null,
      playerIds: [bo.id],
    });
    expect(edited.json()).toMatchObject({
      date: '2026-10-01',
      tournament: null,
      placed: [],
      tagged: [{ id: bo.id, name: 'Bo' }],
    });
    expect(
      (await edit(999, { date: '2026-10-01', tournamentId: null, playerIds: [] })).statusCode,
    ).toBe(404);
  });

  it('keeps the photo, untied, when its tournament is deleted', async () => {
    const { tournament } = await tournamentWithPodium();
    await upload({ tournamentId: tournament.id });
    await app.inject({ method: 'DELETE', url: `/api/tournaments/${tournament.id}`, cookies });
    expect((await list())[0]).toMatchObject({ tournament: null, placed: [] });
  });

  it('refuses files that are not JPEG, PNG or WebP, and a thumbnail that is not a JPEG', async () => {
    expect((await upload({}, { image: Buffer.from('GIF89a……') })).json()).toEqual({
      error: 'not_an_image',
    });
    expect((await upload({}, { thumb: PNG })).json()).toEqual({ error: 'bad_thumbnail' });
    expect((await upload({ date: 'yesterday' })).json()).toEqual({ error: 'bad_data' });
    expect(await readdir(photoDir)).toEqual(['thumbs']);
  });

  it('deletes the photo and its files', async () => {
    const photo = (await upload()).json();
    const deleted = await app.inject({ method: 'DELETE', url: `/api/photos/${photo.id}`, cookies });
    expect(deleted.statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect(await readdir(photoDir)).toEqual(['thumbs']);
    expect(await readdir(join(photoDir, 'thumbs'))).toEqual([]);
    expect((await app.inject({ url: `/api/photos/${photo.id}/image` })).statusCode).toBe(404);
  });

  it('is read-only for everyone else', async () => {
    const photo = (await upload()).json();
    const details = { date: '2026-10-28', tournamentId: null, playerIds: [] };
    for (const response of [
      await upload({}, { auth: false }),
      await app.inject({ method: 'PUT', url: `/api/photos/${photo.id}`, payload: details }),
      await app.inject({ method: 'DELETE', url: `/api/photos/${photo.id}` }),
    ]) {
      expect(response.statusCode).toBe(401);
    }
  });
});
