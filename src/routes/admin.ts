import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';

export function adminRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get('/admin/state', async () => ({ ...store.get(), events: store.events }));

    app.post('/admin/reset', async (_req, reply) => {
      store.reset();
      return reply.code(204).send();
    });
  };
}
