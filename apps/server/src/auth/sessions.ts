import { and, eq, gt, lte } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../db/client.js';
import { admins, sessions } from '../db/schema.js';

export const SESSION_DAYS = 30;

export interface SessionAdmin {
  id: number;
  username: string;
}

/** Only this hash is stored, so a copy of the database can't be used to log in. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a session and returns the token for the cookie. */
export async function createSession(db: Database, adminId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({ id: hashToken(token), adminId, expiresAt });
  return token;
}

/** The admin a session token belongs to, or null if it's unknown or expired. */
export async function adminForToken(db: Database, token: string): Promise<SessionAdmin | null> {
  const [row] = await db
    .select({ id: admins.id, username: admins.username })
    .from(sessions)
    .innerJoin(admins, eq(admins.id, sessions.adminId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
