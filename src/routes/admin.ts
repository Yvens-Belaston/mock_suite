import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';

export function adminRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get('/admin/state', async () => ({ ...store.get(), events: store.events, requests: store.requests }));

    /** Newest first; `limit` defaults to 50 and is capped by the log size. */
    app.get<{ Querystring: { limit?: string } }>('/admin/requests', async (req) => {
      const parsed = Number.parseInt(req.query.limit ?? '', 10);
      const limit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
      return [...store.requests].reverse().slice(0, limit);
    });

    app.post('/admin/reset', async (_req, reply) => {
      store.reset();
      return reply.code(204).send();
    });
  };
}
