import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server.js';
import { createStore, DEFAULT_SEED_DIR } from '../src/store.js';

describe('admin state and reset', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/state shows the seeded Teams channels on a fresh server', async () => {
    const res = await request(app.server).get('/admin/state');
    expect(res.status).toBe(200);
    expect(res.body.teams.channels.map((c: { id: string }) => c.id)).toEqual([
      'hr-onboarding',
      'servicedesk',
      'facilities',
      'automation-coe',
      'algemeen',
    ]);
    expect(res.body.events).toEqual([]);
  });

  it('every store write appends {system, entity, action, id, summary, at} to events', async () => {
    app.store.update('teams', (teams) => {
      (teams.channels as unknown[]).push({ id: 'test-kanaal', name: 'Test kanaal' });
      return { entity: 'channel', action: 'created', id: 'test-kanaal', summary: 'Test kanaal aangemaakt' };
    });

    const res = await request(app.server).get('/admin/state');
    expect(res.body.teams.channels).toHaveLength(6);
    expect(res.body.events).toEqual([
      {
        system: 'teams',
        entity: 'channel',
        action: 'created',
        id: 'test-kanaal',
        summary: 'Test kanaal aangemaakt',
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
      },
    ]);
  });

  it('POST /admin/reset answers 204 within 1000 ms and the state equals a freshly started server', async () => {
    app.store.update('teams', (teams) => {
      const channels = teams.channels as { id: string; name: string }[];
      channels[0].name = 'Gewijzigd';
      return { entity: 'channel', action: 'updated', id: channels[0].id, summary: 'Kanaal gewijzigd' };
    });

    const started = performance.now();
    const reset = await request(app.server).post('/admin/reset');
    const elapsed = performance.now() - started;
    expect(reset.status).toBe(204);
    expect(elapsed).toBeLessThan(1000);

    const fresh = buildServer();
    await fresh.ready();
    try {
      const expected = await request(fresh.server).get('/admin/state');
      const actual = await request(app.server).get('/admin/state');
      expect(actual.body).toEqual(expected.body);
      expect(actual.body.events).toEqual([]);
      expect(actual.body.teams.channels[0].name).toBe('HR Onboarding');
    } finally {
      await fresh.close();
    }
  });

  it('a write after reset does not leak into the seed (seed is deep-cloned)', async () => {
    app.store.update('teams', (teams) => {
      (teams.channels as { name: string }[])[1].name = 'Lek';
      return { entity: 'channel', action: 'updated', id: 'servicedesk', summary: 'Kanaal gewijzigd' };
    });
    await request(app.server).post('/admin/reset');
    const res = await request(app.server).get('/admin/state');
    expect(res.body.teams.channels[1].name).toBe('Servicedesk');
  });
});

describe('POST /admin/reset re-reads the seed files from disk', () => {
  it('applies a seed file edited after start-up, without a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-'));
    cpSync(DEFAULT_SEED_DIR, dir, { recursive: true });
    const app = buildServer({ store: createStore(dir) });
    await app.ready();
    try {
      const teams = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8'));
      teams.channels[0].name = 'Nieuw uit seed';
      writeFileSync(join(dir, 'teams.json'), JSON.stringify(teams));

      const before = await request(app.server).get('/admin/state');
      expect(before.body.teams.channels[0].name).toBe('HR Onboarding');

      expect((await request(app.server).post('/admin/reset')).status).toBe(204);
      const after = await request(app.server).get('/admin/state');
      expect(after.body.teams.channels[0].name).toBe('Nieuw uit seed');
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
