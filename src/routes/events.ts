import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { ChangeEvent, Store } from '../store.js';

export const HEARTBEAT_MS = 15_000;

/** `GET /events`: Server-Sent Events, one `event: change` per store change, `: ping` heartbeat. */
export function eventsRoutes(store: Store, heartbeatMs = HEARTBEAT_MS) {
  return async function (app: FastifyInstance): Promise<void> {
    const open = new Set<ServerResponse>();
    // Open streams would otherwise keep `app.close()` waiting.
    app.addHook('onClose', async () => {
      for (const res of open) res.end();
    });

    app.get('/events', (req, reply) => {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(': connected\n\n');

      const onChange = (event: ChangeEvent) => res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
      store.emitter.on('change', onChange);
      open.add(res);

      req.raw.on('close', () => {
        clearInterval(heartbeat);
        store.emitter.off('change', onChange);
        open.delete(res);
      });
    });
  };
}
