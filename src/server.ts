import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { adminRoutes } from './routes/admin.js';
import { eventsRoutes } from './routes/events.js';
import { topdeskRoutes } from './routes/topdesk.js';
import { teamsRoutes } from './routes/teams.js';
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
  /** Artificial latency on mock API routes. Defaults to `RESPONSE_DELAY_MS`, else 150. */
  responseDelayMs?: number;
  /** Share (0-1) of mock API calls answered with an empty 503. Defaults to `FAIL_RATE`, else 0. */
  failRate?: number;
  /** Source of randomness for `failRate`; defaults to `Math.random`. */
  random?: () => number;
}

/** Paths that simulate a vendor API (spec section 4); only these get latency, fail rate and the request log. */
const MOCK_API_PATH = /^\/(tas\/api|v1\.0|rest\/api\/3|teams\/hook)(\/|$)|^\/[^/]+\/oauth2\/v2\.0\/token$/;

export function isMockApiPath(path: string): boolean {
  return MOCK_API_PATH.test(path);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pathOf(req: FastifyRequest): string {
  return req.url.split('?')[0];
}

/** A mock API call from Bonita, i.e. not a screen action (`X-Mock-Source: ui`). */
function isSimulatedCall(req: FastifyRequest): boolean {
  return isMockApiPath(pathOf(req)) && req.headers['x-mock-source'] !== 'ui';
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = options.store ?? createStore();
  const responseDelayMs = options.responseDelayMs ?? numberFromEnv(process.env.RESPONSE_DELAY_MS, 150);
  const failRate = options.failRate ?? numberFromEnv(process.env.FAIL_RATE, 0);
  const random = options.random ?? Math.random;
  app.decorate('store', store);

  app.addHook('onRequest', async (req, reply) => {
    if (!isSimulatedCall(req)) return;
    if (responseDelayMs > 0) await sleep(responseDelayMs);
    if (failRate > 0 && random() < failRate) return reply.code(503).send();
  });

  app.addHook('onResponse', async (req, reply) => {
    const path = pathOf(req);
    const ms = Math.round(reply.elapsedTime);
    process.stdout.write(`${req.method} ${path} ${reply.statusCode} · ${ms} ms\n`);
    if (isSimulatedCall(req)) {
      store.logRequest({ method: req.method, path, body: req.body ?? null, status: reply.statusCode, ms });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(adminRoutes(store));
  app.register(eventsRoutes(store, options.heartbeatMs));
  app.register(topdeskRoutes(store), { prefix: '/tas/api' });
  app.register(teamsRoutes(store));

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
