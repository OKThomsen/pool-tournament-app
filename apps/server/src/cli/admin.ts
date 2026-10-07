// Manages admin accounts. There is no sign-up page, so this is the only way to create one.
//
//   npm run admin -w @franks/server -- create <username>
//   npm run admin -w @franks/server -- set-password <username>
//   npm run admin -w @franks/server -- list
//
// The password is asked for without echoing it. For scripts, set ADMIN_PASSWORD instead.

import { eq } from 'drizzle-orm';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../auth/password.js';
import { config } from '../config.js';
import { createDb, runMigrations } from '../db/client.js';
import { admins, sessions } from '../db/schema.js';

const MIN_PASSWORD_LENGTH = 8;

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  const ask = async (question: string) => {
    process.stdout.write(question);
    // A muted output stream keeps the terminal from echoing what's typed.
    const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    const answer = await rl.question('');
    rl.close();
    process.stdout.write('\n');
    return answer;
  };
  const password = await ask('Password: ');
  if ((await ask('Repeat password: ')) !== password) throw new Error('The passwords differ');
  return password;
}

async function validPassword(): Promise<string> {
  const password = await readPassword();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return password;
}

const [command, username] = process.argv.slice(2);
const { db, pool } = createDb(config.databaseUrl);

try {
  await runMigrations(db);
  switch (command) {
    case 'create': {
      if (!username) throw new Error('Usage: create <username>');
      const [existing] = await db.select().from(admins).where(eq(admins.username, username));
      if (existing) throw new Error(`Admin "${username}" already exists`);
      const passwordHash = await hashPassword(await validPassword());
      await db.insert(admins).values({ username, passwordHash });
      console.log(`Created admin "${username}"`);
      break;
    }
    case 'set-password': {
      if (!username) throw new Error('Usage: set-password <username>');
      const [admin] = await db.select().from(admins).where(eq(admins.username, username));
      if (!admin) throw new Error(`No admin called "${username}"`);
      const passwordHash = await hashPassword(await validPassword());
      await db.update(admins).set({ passwordHash }).where(eq(admins.id, admin.id));
      // Sign the admin out everywhere, in case the old password leaked.
      await db.delete(sessions).where(eq(sessions.adminId, admin.id));
      console.log(`Changed the password for "${username}" and signed them out everywhere`);
      break;
    }
    case 'list': {
      const rows = await db.select({ username: admins.username }).from(admins);
      console.log(rows.map((row) => row.username).join('\n') || '(no admins)');
      break;
    }
    default:
      throw new Error('Commands: create <username>, set-password <username>, list');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
