import type { FastifyPluginAsync } from 'fastify';
import type { Events } from '../events.js';

/** How often to send a comment line, so proxies don't close an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: `event: tournament` with `{ "tournamentId": n }` whenever a tournament
 * changes. Public, like the pages it keeps up to date.
 */
export const eventRoutes: FastifyPluginAsync<{ events: Events }> = async (app, { events }) => {
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
    stream.write(': connected\n\n');

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
