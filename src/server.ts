import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adminRoutes } from './routes/admin.js';
import { eventsRoutes } from './routes/events.js';
import { uiRoutes } from './routes/ui.js';
import { createStore, type Store } from './store.js';

declare module 'fastify' {
  interface FastifyInstance {
    store: Store;
  }
}

export interface ServerOptions {
  /** Defaults to a fresh store loaded from `seed/`. */
  store?: Store;
  /** SSE heartbeat interval for `/events`; defaults to 15 s (spec section 7). */
  heartbeatMs?: number;
  /** Built screens (`npm run build:web`) served at `/ui/`; defaults to `<repo>/web/dist`. */
  webDist?: string;
}

/** Resolves to `<repo>/web/dist` from both `src/` (tsx/vitest) and `dist/` (node). */
export const DEFAULT_WEB_DIST = fileURLToPath(new URL('../web/dist/', import.meta.url));

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = options.store ?? createStore();
  app.decorate('store', store);

  app.addHook('onResponse', async (req, reply) => {
    const path = req.url.split('?')[0];
    const ms = Math.round(reply.elapsedTime);
    process.stdout.write(`${req.method} ${path} ${reply.statusCode} · ${ms} ms\n`);
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(adminRoutes(store));
  app.register(eventsRoutes(store, options.heartbeatMs));
  app.register(uiRoutes(options.webDist ?? DEFAULT_WEB_DIST));

  return app;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const app = buildServer();
  app.listen({ port, host: '0.0.0.0' }).then(
    () => process.stdout.write(`mock-suite listening on http://localhost:${port}\n`),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
