import { and, eq, gt, lte, ne } from 'drizzle-orm';
import { randomBytes, randomInt } from 'node:crypto';
import type { Database, Executor } from '../db/client.js';
import { playerSessions, tournaments } from '../db/schema.js';
import { hashToken } from './sessions.js';

/** Long enough for a tournament night; the session ends with the tournament anyway. */
export const PLAYER_SESSION_HOURS = 24;

/** A player on /play: may score the matches of this tournament. */
export interface SessionPlayer {
  tournamentId: number;
}

/** A random 6-digit join code, different from `previous`. */
export function newJoinCode(previous?: string | null): string {
  let code: string;
  do code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  while (code === previous);
  return code;
}

/**
 * Gives a tournament a new join code and signs out everyone who joined with the old one.
 * Returns the new code.
 */
export async function replaceJoinCode(
  db: Executor,
  tournamentId: number,
  previous: string | null,
): Promise<string> {
  const joinCode = newJoinCode(previous);
  await db.update(tournaments).set({ joinCode }).where(eq(tournaments.id, tournamentId));
  await db.delete(playerSessions).where(eq(playerSessions.tournamentId, tournamentId));
  return joinCode;
}

/** The tournament in progress with this join code, or null. */
export async function tournamentForCode(db: Database, code: string): Promise<number | null> {
  const [row] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.joinCode, code), ne(tournaments.status, 'concluded')));
  return row?.id ?? null;
}

/** Creates a player session for a tournament and returns the token for the cookie. */
export async function createPlayerSession(db: Database, tournamentId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PLAYER_SESSION_HOURS * 60 * 60 * 1000);
  await db.delete(playerSessions).where(lte(playerSessions.expiresAt, new Date()));
  await db.insert(playerSessions).values({ id: hashToken(token), tournamentId, expiresAt });
  return token;
}

/**
 * The player a session token belongs to, or null if it's unknown, expired, or its tournament is
 * no longer in progress.
 */
export async function playerForToken(db: Database, token: string): Promise<SessionPlayer | null> {
  const [row] = await db
    .select({ tournamentId: playerSessions.tournamentId })
    .from(playerSessions)
    .innerJoin(tournaments, eq(tournaments.id, playerSessions.tournamentId))
    .where(
      and(
        eq(playerSessions.id, hashToken(token)),
        gt(playerSessions.expiresAt, new Date()),
        ne(tournaments.status, 'concluded'),
      ),
    );
  return row ?? null;
}

export async function deletePlayerSession(db: Database, token: string): Promise<void> {
  await db.delete(playerSessions).where(eq(playerSessions.id, hashToken(token)));
}
