import { createSession } from '../auth/sessions.js';
import type { Database } from '../db/client.js';
import { admins } from '../db/schema.js';

/**
 * Creates an admin with a session and returns the cookies to pass to `app.inject`. Skips the
 * login route on purpose: it's rate-limited and slow, and auth.test.ts covers it.
 */
export async function loginAsAdmin(db: Database) {
  const [admin] = await db
    .insert(admins)
    .values({ username: 'admin', passwordHash: 'not used' })
    .returning();
  return { session: await createSession(db, admin!.id) };
}
