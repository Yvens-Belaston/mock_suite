import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 {"status":"ok"}', async () => {
    const res = await request(app.server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('logs "METHOD path status · N ms" to stdout', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await request(app.server).get('/health');
      const lines = write.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => /^GET \/health 200 · \d+ ms\n$/.test(l))).toBe(true);
    } finally {
      write.mockRestore();
    }
  });
});
