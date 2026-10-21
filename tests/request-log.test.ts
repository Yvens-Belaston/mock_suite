import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type ServerOptions } from '../src/server.js';

let app: FastifyInstance | undefined;

/** A server with stand-in mock API routes, as a route file would add them. */
async function start(options: ServerOptions = {}): Promise<FastifyInstance> {
  app = buildServer({ responseDelayMs: 0, ...options });
  app.post('/v1.0/users', async (_req, reply) => reply.code(201).send({ id: 'u-1' }));
  // Route files register as plugins; the hooks must reach into their encapsulated context.
  app.register(async (plugin) => {
    plugin.post('/:tenant/oauth2/v2.0/token', async () => ({ access_token: 'x' }));
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('request log', () => {
  it('lists a mock API request in /admin/requests with method, path, body, status, ms and at', async () => {
    const server = await start();
    await request(server.server).post('/v1.0/users?x=1').send({ displayName: 'Sanne de Vries' });

    const res = await request(server.server).get('/admin/requests');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        method: 'POST',
        path: '/v1.0/users',
        body: { displayName: 'Sanne de Vries' },
        status: 201,
        ms: expect.any(Number),
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
  });

  it('does not log the same request sent with X-Mock-Source: ui', async () => {
    const server = await start();
    await request(server.server).post('/v1.0/users').set('X-Mock-Source', 'ui').send({ displayName: 'UI' });

    const res = await request(server.server).get('/admin/requests');
    expect(res.body).toEqual([]);
  });

  it('logs the token route but never /health or /admin', async () => {
    const server = await start();
    await request(server.server).get('/health');
    await request(server.server).get('/admin/state');
    await request(server.server).post('/demo-amsterdam/oauth2/v2.0/token').type('form').send('grant_type=client_credentials');

    const res = await request(server.server).get('/admin/requests');
    expect(res.body.map((r: { path: string }) => r.path)).toEqual(['/demo-amsterdam/oauth2/v2.0/token']);
  });

  it('returns the newest calls first, `limit` of them (default 50), and keeps only the last 500', async () => {
    const server = await start();
    for (let i = 1; i <= 501; i++) server.store.logRequest({ method: 'GET', path: `/v1.0/users/${i}`, body: null, status: 200, ms: 1 });

    const two = await request(server.server).get('/admin/requests?limit=2');
    expect(two.body.map((r: { path: string }) => r.path)).toEqual(['/v1.0/users/501', '/v1.0/users/500']);

    const byDefault = await request(server.server).get('/admin/requests');
    expect(byDefault.body).toHaveLength(50);

    const all = await request(server.server).get('/admin/requests?limit=1000');
    expect(all.body).toHaveLength(500);
    expect(all.body.at(-1).path).toBe('/v1.0/users/2');
  });

  it('exposes the log as `requests` in /admin/state and clears it on reset', async () => {
    const server = await start();
    await request(server.server).post('/v1.0/users').send({ displayName: 'Sanne de Vries' });

    const before = await request(server.server).get('/admin/state');
    expect(before.body.requests.map((r: { path: string }) => r.path)).toEqual(['/v1.0/users']);

    await request(server.server).post('/admin/reset');
    const after = await request(server.server).get('/admin/state');
    expect(after.body.requests).toEqual([]);
    expect((await request(server.server).get('/admin/requests')).body).toEqual([]);
  });

  it('emits an admin/request/created change for each logged call', async () => {
    const server = await start();
    const seen: unknown[] = [];
    server.store.emitter.on('change', (e) => seen.push(e));

    await request(server.server).post('/v1.0/users').send({});
    await request(server.server).post('/v1.0/users').set('X-Mock-Source', 'ui').send({});

    expect(seen).toEqual([
      expect.objectContaining({ system: 'admin', entity: 'request', action: 'created', summary: expect.stringContaining('POST /v1.0/users 201') }),
    ]);
  });
});

describe('fail rate', () => {
  it('answers a mock API call with an empty 503 when the draw falls under FAIL_RATE, and logs it', async () => {
    const server = await start({ failRate: 0.5, random: () => 0.1 });
    const res = await request(server.server).post('/v1.0/users').send({});
    expect(res.status).toBe(503);
    expect(res.text).toBe('');

    const log = await request(server.server).get('/admin/requests');
    expect(log.body[0]).toMatchObject({ path: '/v1.0/users', status: 503 });
  });

  it('lets the call through when the draw is at or above FAIL_RATE', async () => {
    const server = await start({ failRate: 0.5, random: () => 0.5 });
    expect((await request(server.server).post('/v1.0/users').send({})).status).toBe(201);
  });

  it('never fails /admin, /health or X-Mock-Source: ui calls', async () => {
    const server = await start({ failRate: 1 });
    expect((await request(server.server).get('/health')).status).toBe(200);
    expect((await request(server.server).get('/admin/requests')).status).toBe(200);
    expect((await request(server.server).post('/v1.0/users').set('X-Mock-Source', 'ui').send({})).status).toBe(201);
  });
});

describe('response delay', () => {
  it('delays mock API calls by about responseDelayMs, but not X-Mock-Source: ui calls', async () => {
    const server = await start({ responseDelayMs: 120 });

    let t = performance.now();
    await request(server.server).post('/v1.0/users').send({});
    expect(performance.now() - t).toBeGreaterThanOrEqual(110);
    const [entry] = (await request(server.server).get('/admin/requests')).body;
    expect(entry.ms).toBeGreaterThanOrEqual(110);

    t = performance.now();
    await request(server.server).post('/v1.0/users').set('X-Mock-Source', 'ui').send({});
    await request(server.server).get('/health');
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('reads RESPONSE_DELAY_MS and FAIL_RATE from the environment when no option is given', async () => {
    const saved = { delay: process.env.RESPONSE_DELAY_MS, fail: process.env.FAIL_RATE };
    process.env.RESPONSE_DELAY_MS = '0';
    process.env.FAIL_RATE = '1';
    try {
      app = buildServer();
      app.post('/v1.0/users', async () => ({}));
      await app.ready();
      expect((await request(app.server).post('/v1.0/users').send({})).status).toBe(503);
    } finally {
      process.env.RESPONSE_DELAY_MS = saved.delay;
      process.env.FAIL_RATE = saved.fail;
      if (saved.delay === undefined) delete process.env.RESPONSE_DELAY_MS;
      if (saved.fail === undefined) delete process.env.FAIL_RATE;
    }
  });
});
