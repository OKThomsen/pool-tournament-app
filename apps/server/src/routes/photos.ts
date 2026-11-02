import fastifyMultipart from '@fastify/multipart';
import { seasonForDate } from '@franks/core';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireAdmin } from '../auth/plugin.js';
import type { Database, Executor } from '../db/client.js';
import { photoPlayers, photos, players, results, tournaments } from '../db/schema.js';

/** Photos straight from a phone are a few MB; this leaves room for big ones. */
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
/** The browser makes the thumbnail, a small JPEG. */
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

/** What can be changed about a photo: its date, the tournament and the tagged players. */
const detailsProperties = {
  date: { type: 'string', format: 'date' },
  tournamentId: { type: ['integer', 'null'], minimum: 1 },
  playerIds: {
    type: 'array',
    items: { type: 'integer', minimum: 1 },
    uniqueItems: true,
    maxItems: 64,
  },
} as const;

const detailsBody = {
  type: 'object',
  required: ['date', 'tournamentId', 'playerIds'],
  additionalProperties: false,
  properties: detailsProperties,
} as const;

/** The `data` field of an upload: the details, and the image's size in pixels. */
const uploadData = {
  type: 'object',
  required: ['date', 'tournamentId', 'playerIds', 'width', 'height'],
  additionalProperties: false,
  properties: {
    ...detailsProperties,
    width: { type: 'integer', minimum: 1, maximum: 100000 },
    height: { type: 'integer', minimum: 1, maximum: 100000 },
  },
} as const;

interface PhotoDetails {
  date: string;
  /** The tournament this becomes the winner picture of, or null for none. */
  tournamentId: number | null;
  /** Players tagged in the photo. */
  playerIds: number[];
}

interface UploadData extends PhotoDetails {
  width: number;
  height: number;
}

/** The image type from the file's first bytes, or null if it isn't a JPEG, PNG or WebP. */
export function imageType(bytes: Buffer): { mimeType: string; extension: string } | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', extension: '.png' };
  }
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }
  return null;
}

/**
 * Why the details can't be saved: the tournament doesn't exist or isn't concluded (only a
 * concluded tournament has a top three), or a tagged player doesn't exist.
 */
async function detailsError(db: Executor, details: PhotoDetails): Promise<string | null> {
  if (details.tournamentId !== null) {
    const [tournament] = await db
      .select({ status: tournaments.status })
      .from(tournaments)
      .where(eq(tournaments.id, details.tournamentId));
    if (!tournament) return 'unknown_tournament';
    if (tournament.status !== 'concluded') return 'tournament_not_concluded';
  }
  if (details.playerIds.length > 0) {
    const found = await db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, details.playerIds));
    if (found.length !== details.playerIds.length) return 'unknown_player';
  }
  return null;
}

/**
 * Saves the details of photo `id`. A tournament has one winner picture, so a photo already tied
 * to the tournament is untied (it stays in the gallery).
 */
async function saveDetails(db: Executor, id: number, details: PhotoDetails) {
  if (details.tournamentId !== null) {
    await db
      .update(photos)
      .set({ tournamentId: null })
      .where(and(eq(photos.tournamentId, details.tournamentId), ne(photos.id, id)));
  }
  await db
    .update(photos)
    .set({ date: details.date, tournamentId: details.tournamentId })
    .where(eq(photos.id, id));
  await db.delete(photoPlayers).where(eq(photoPlayers.photoId, id));
  if (details.playerIds.length > 0) {
    await db
      .insert(photoPlayers)
      .values(details.playerIds.map((playerId) => ({ photoId: id, playerId })));
  }
}

const PODIUM = ['1st', '2nd', '3rd'] as const;

/**
 * Every photo, newest first, with what the gallery's search looks at: the tournament it's the
 * winner picture of (date, format, season), the tournament's top three and the tagged players.
 * `ids` limits it to those photos.
 */
async function listPhotos(db: Executor, ids?: number[]) {
  const rows = await db
    .select({
      id: photos.id,
      date: photos.date,
      width: photos.width,
      height: photos.height,
      tournamentId: photos.tournamentId,
      tournamentDate: tournaments.date,
      format: tournaments.format,
      duo: tournaments.duo,
      forFun: tournaments.forFun,
    })
    .from(photos)
    .leftJoin(tournaments, eq(tournaments.id, photos.tournamentId))
    .where(ids ? inArray(photos.id, ids) : undefined)
    .orderBy(desc(photos.date), desc(photos.id));
  const photoIds = rows.map((row) => row.id);
  const tournamentIds = rows.flatMap((row) =>
    row.tournamentId === null ? [] : [row.tournamentId],
  );

  const tagged =
    photoIds.length === 0
      ? []
      : await db
          .select({ photoId: photoPlayers.photoId, id: players.id, name: players.name })
          .from(photoPlayers)
          .innerJoin(players, eq(players.id, photoPlayers.playerId))
          .where(inArray(photoPlayers.photoId, photoIds))
          .orderBy(asc(players.name));
  // In a "Par turnering" both players of a team have the team's placement.
  const placed =
    tournamentIds.length === 0
      ? []
      : await db
          .select({
            tournamentId: results.tournamentId,
            playerId: players.id,
            name: players.name,
            placement: results.placement,
          })
          .from(results)
          .innerJoin(players, eq(players.id, results.playerId))
          .where(
            and(
              inArray(results.tournamentId, tournamentIds),
              inArray(results.placement, [...PODIUM]),
            ),
          )
          .orderBy(asc(results.placement), asc(players.name));

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    width: row.width,
    height: row.height,
    // A winner picture belongs to its tournament's season, whatever day it was taken.
    season: seasonForDate(row.tournamentDate ?? row.date)?.label ?? null,
    tournament:
      row.tournamentId === null
        ? null
        : {
            id: row.tournamentId,
            date: row.tournamentDate!,
            format: row.format!,
            duo: row.duo!,
            forFun: row.forFun!,
          },
    placed: placed
      .filter((p) => p.tournamentId === row.tournamentId)
      .map(({ playerId, name, placement }) => ({ playerId, name, placement })),
    tagged: tagged.filter((p) => p.photoId === row.id).map(({ id, name }) => ({ id, name })),
  }));
}

/** The image and the thumbnail of an upload, and its details. */
interface Upload {
  image?: Buffer;
  thumb?: Buffer;
  data?: string;
}

/** Reads an upload's parts. Throws Fastify's 413 error when a file is too big. */
async function readUpload(request: FastifyRequest): Promise<Upload> {
  const upload: Upload = {};
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname === 'image') {
        upload.image = await part.toBuffer();
      } else if (part.fieldname === 'thumb') {
        const thumb = await part.toBuffer();
        if (thumb.length <= MAX_THUMB_BYTES) upload.thumb = thumb;
      } else {
        part.file.resume();
      }
    } else if (part.fieldname === 'data' && typeof part.value === 'string') {
      upload.data = part.value;
    }
  }
  return upload;
}

/**
 * The gallery ("Galleri"): photos the admins upload, each with a date, tagged players and maybe
 * a tournament it's the winner picture of. Files are kept in `photoDir`, thumbnails in its
 * `thumbs` folder.
 */
export const photoRoutes: FastifyPluginAsync<{ db: Database; photoDir: string }> = async (
  app,
  { db, photoDir },
) => {
  await mkdir(join(photoDir, 'thumbs'), { recursive: true });
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 1 },
  });
  const imagePath = (file: string) => join(photoDir, file);
  const thumbPath = (file: string) => join(photoDir, 'thumbs', file);

  app.get('/photos', async () => listPhotos(db));

  /** Sends a stored file. The files never change (a new upload gets a new name). */
  async function sendFile(
    reply: FastifyReply,
    id: number,
    path: (file: string) => string,
    thumb: boolean,
  ) {
    const [photo] = await db
      .select({ file: photos.file, mimeType: photos.mimeType })
      .from(photos)
      .where(eq(photos.id, id));
    if (!photo) return reply.code(404).send({ error: 'not_found' });
    const filePath = path(photo.file);
    try {
      const { size } = await stat(filePath);
      reply.header('content-length', size);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply
      .type(thumb ? 'image/jpeg' : photo.mimeType)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(filePath));
  }

  app.get<{ Params: { id: number } }>(
    '/photos/:id/image',
    { schema: { params: idParams } },
    async (request, reply) => sendFile(reply, request.params.id, imagePath, false),
  );

  app.get<{ Params: { id: number } }>(
    '/photos/:id/thumb',
    { schema: { params: idParams } },
    async (request, reply) => sendFile(reply, request.params.id, thumbPath, true),
  );

  /**
   * Uploads a photo: multipart with the original (`image`, a JPEG, PNG or WebP kept as it is), a
   * JPEG thumbnail the browser made (`thumb`), and the details as JSON (`data`).
   */
  app.post('/photos', { preHandler: requireAdmin }, async (request, reply) => {
    if (!request.isMultipart()) return reply.code(415).send({ error: 'not_multipart' });
    const upload = await readUpload(request);
    const type = upload.image && imageType(upload.image);
    if (!upload.image || !type) return reply.code(400).send({ error: 'not_an_image' });
    if (!upload.thumb || imageType(upload.thumb)?.mimeType !== 'image/jpeg') {
      return reply.code(400).send({ error: 'bad_thumbnail' });
    }
    let data: unknown;
    try {
      data = JSON.parse(upload.data ?? '');
    } catch {
      return reply.code(400).send({ error: 'bad_data' });
    }
    if (!request.validateInput(data, uploadData)) {
      return reply.code(400).send({ error: 'bad_data' });
    }
    const details = data as UploadData;
    const error = await detailsError(db, details);
    if (error) return reply.code(400).send({ error });

    const file = `${randomUUID()}${type.extension}`;
    await writeFile(imagePath(file), upload.image);
    await writeFile(thumbPath(file), upload.thumb);
    try {
      const id = await db.transaction(async (tx) => {
        const [photo] = await tx
          .insert(photos)
          .values({
            date: details.date,
            file,
            mimeType: type.mimeType,
            width: details.width,
            height: details.height,
          })
          .returning({ id: photos.id });
        await saveDetails(tx, photo!.id, details);
        return photo!.id;
      });
      const [photo] = await listPhotos(db, [id]);
      return reply.code(201).send(photo);
    } catch (e) {
      await rm(imagePath(file), { force: true });
      await rm(thumbPath(file), { force: true });
      throw e;
    }
  });

  /** Changes a photo's date, tournament and tagged players. */
  app.put<{ Params: { id: number }; Body: PhotoDetails }>(
    '/photos/:id',
    { preHandler: requireAdmin, schema: { params: idParams, body: detailsBody } },
    async (request, reply) => {
      const { id } = request.params;
      const [existing] = await db.select({ id: photos.id }).from(photos).where(eq(photos.id, id));
      if (!existing) return reply.code(404).send({ error: 'not_found' });
      const error = await detailsError(db, request.body);
      if (error) return reply.code(400).send({ error });
      await db.transaction((tx) => saveDetails(tx, id, request.body));
      const [photo] = await listPhotos(db, [id]);
      return photo;
    },
  );

  app.delete<{ Params: { id: number } }>(
    '/photos/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const [deleted] = await db
        .delete(photos)
        .where(eq(photos.id, request.params.id))
        .returning({ file: photos.file });
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      await rm(imagePath(deleted.file), { force: true });
      await rm(thumbPath(deleted.file), { force: true });
      return reply.code(204).send();
    },
  );
};
