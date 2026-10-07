import type { FastifyPluginAsync } from 'fastify';
import type { Events } from '../events.js';

/** How often to send a comment line, so proxies don't close an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events. On connecting: `event: hello` with `{ "version": "…" }`, the version of the
 * frontend being served; a page that sees a different version after reconnecting reloads itself,
 * so the flatscreen picks up updates. Then `event: tournament` with `{ "tournamentId": n }`
 * whenever a tournament changes. Public, like the pages it keeps up to date.
 */
export const eventRoutes: FastifyPluginAsync<{ events: Events; version: string }> = async (
  app,
  { events, version },
) => {
  app.get('/events', (request, reply) => {
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    stream.write(`event: hello\ndata: ${JSON.stringify({ version })}\n\n`);

    const unsubscribe = events.subscribe((event) => {
      stream.write(`event: tournament\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => stream.write(': heartbeat\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};
