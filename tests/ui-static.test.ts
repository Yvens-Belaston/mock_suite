import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

describe('/ui/ serves the built screens', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const webDist = mkdtempSync(join(tmpdir(), 'web-dist-'));
    mkdirSync(join(webDist, 'assets'));
    writeFileSync(join(webDist, 'index.html'), '<!doctype html><div id="root">screens</div>');
    writeFileSync(join(webDist, 'assets', 'app.js'), 'console.log("Gesimuleerd")');
    app = buildServer({ webDist });
    await app.ready();
  });
  afterAll(() => app.close());

  it('serves assets under /ui/assets/', async () => {
    const res = await request(app.server).get('/ui/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('Gesimuleerd');
  });

  it.each(['/ui/', '/ui/entra', '/ui/overview?compact=1', '/ui/jira/IAM-101'])(
    'falls back to index.html for %s',
    async (path) => {
      const res = await request(app.server).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('screens');
    },
  );

  it('redirects /ui to /ui/', async () => {
    const res = await request(app.server).get('/ui');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ui/');
  });

  it('answers a missing asset with 404, not the app', async () => {
    const res = await request(app.server).get('/ui/assets/missing.js');
    expect(res.status).toBe(404);
  });

  it('leaves other unknown routes as 404', async () => {
    const res = await request(app.server).get('/nope');
    expect(res.status).toBe(404);
  });
});
