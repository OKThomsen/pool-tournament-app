import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createTestDb } from '../test/database.js';

const { db, pool } = createTestDb();
const webDist = mkdtempSync(join(tmpdir(), 'franks-web-'));

afterAll(async () => {
  await pool.end();
  rmSync(webDist, { recursive: true, force: true });
});

/** The version the live stream announces for the frontend currently in `webDist`. */
async function announcedVersion(): Promise<string> {
  const app = await buildApp({ db, logger: false, webDist });
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const controller = new AbortController();
  try {
    const response = await fetch(`${address}/api/events`, { signal: controller.signal });
    const { value } = await response.body!.getReader().read();
    const hello = /event: hello\ndata: (.*)\n/.exec(new TextDecoder().decode(value))!;
    return JSON.parse(hello[1]!).version;
  } finally {
    controller.abort();
    await app.close();
  }
}

describe('frontend version on the live stream', () => {
  it('changes when a new frontend is built, so open pages reload', async () => {
    writeFileSync(join(webDist, 'index.html'), '<script src="/assets/index-aaa.js"></script>');
    const before = await announcedVersion();
    expect(before).toMatch(/^[0-9a-f]{12}$/);
    expect(await announcedVersion()).toBe(before);

    writeFileSync(join(webDist, 'index.html'), '<script src="/assets/index-bbb.js"></script>');
    expect(await announcedVersion()).not.toBe(before);
  });
});
