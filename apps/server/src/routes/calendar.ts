import { todayInDenmark } from '@franks/core';
import { asc, eq, gte } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../auth/plugin.js';
import type { Database } from '../db/client.js';
import { calendarEvents } from '../db/schema.js';

const eventBody = {
  type: 'object',
  required: ['date', 'message'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', format: 'date' },
    message: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
  },
} as const;
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

interface EventBody {
  date: string;
  message: string;
}

const columns = {
  id: calendarEvents.id,
  date: calendarEvents.date,
  message: calendarEvents.message,
};

/** The frontpage's calendar: events the admins post, each a date and a message. */
export const calendarRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /** Today's and coming events, soonest first; past events drop off by themselves. */
  app.get('/calendar', async () => {
    return db
      .select(columns)
      .from(calendarEvents)
      .where(gte(calendarEvents.date, todayInDenmark()))
      .orderBy(asc(calendarEvents.date), asc(calendarEvents.id));
  });

  app.post<{ Body: EventBody }>(
    '/calendar',
    { preHandler: requireAdmin, schema: { body: eventBody } },
    async (request, reply) => {
      const { date, message } = request.body;
      if (date < todayInDenmark()) return reply.code(400).send({ error: 'date_in_past' });
      const [event] = await db
        .insert(calendarEvents)
        .values({ date, message: message.trim() })
        .returning(columns);
      return reply.code(201).send(event);
    },
  );

  app.put<{ Params: { id: number }; Body: EventBody }>(
    '/calendar/:id',
    { preHandler: requireAdmin, schema: { params: idParams, body: eventBody } },
    async (request, reply) => {
      const { date, message } = request.body;
      if (date < todayInDenmark()) return reply.code(400).send({ error: 'date_in_past' });
      const [event] = await db
        .update(calendarEvents)
        .set({ date, message: message.trim() })
        .where(eq(calendarEvents.id, request.params.id))
        .returning(columns);
      return event ?? reply.code(404).send({ error: 'not_found' });
    },
  );

  app.delete<{ Params: { id: number } }>(
    '/calendar/:id',
    { preHandler: requireAdmin, schema: { params: idParams } },
    async (request, reply) => {
      const deleted = await db
        .delete(calendarEvents)
        .where(eq(calendarEvents.id, request.params.id))
        .returning({ id: calendarEvents.id });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );
};
