import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

/** The section 5 contract example, as the screen form sends it. */
const SANNE = {
  firstName: 'Sanne',
  lastName: 'de Vries',
  startDate: '2026-12-01',
  department: 'Digitalisering',
  role: 'Business Analist',
  location: 'Stadhuis Amstel 1',
  equipmentProfile: 'Standaard laptop',
  parking: false,
  applications: ['SAP', 'Zaaksysteem'],
  managerEmail: 'pieter.bakker@demo-amsterdam.onmicrosoft.com',
};

describe('POST /admin/topdesk/onboarding', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('creates incident I 2610 009 in Personeel / Indiensttreding with the manager as caller', async () => {
    const res = await request(app.server).post('/admin/topdesk/onboarding').send(SANNE);
    expect(res.status).toBe(201);
    const { incident } = res.body;
    expect(incident.number).toBe('I 2610 009');
    expect(incident.briefDescription).toBe('Indiensttreding Sanne de Vries');
    expect(incident.category).toEqual({ name: 'Personeel' });
    expect(incident.subcategory).toEqual({ name: 'Indiensttreding' });
    expect(incident.caller).toMatchObject({ dynamicName: 'Pieter Bakker' });
    expect(incident.request).toContain('01-12-2026');
    expect(incident.request).toContain('Business Analist');
    expect(incident.request).toContain('SAP, Zaaksysteem');

    const state = await request(app.server).get('/admin/state');
    expect(state.body.topdesk.incidents.map((i: { number: string }) => i.number)).toContain('I 2610 009');
  });

  it('rejects a form without a name with 400 and creates nothing', async () => {
    const res = await request(app.server)
      .post('/admin/topdesk/onboarding')
      .send({ ...SANNE, firstName: ' ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/firstName/);
    const state = await request(app.server).get('/admin/state');
    expect(state.body.topdesk.incidents).toHaveLength(8);
  });

  it('rejects an unknown manager e-mail with 400', async () => {
    const res = await request(app.server)
      .post('/admin/topdesk/onboarding')
      .send({ ...SANNE, managerEmail: 'niemand@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/niemand@example.com/);
  });
});

describe('GET /admin/state config', () => {
  const saved = process.env.BONITA_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.BONITA_ENABLED;
    else process.env.BONITA_ENABLED = saved;
  });

  it.each([
    ['false', false],
    ['true', true],
  ])('BONITA_ENABLED=%s -> config.bonitaEnabled %s', async (env, expected) => {
    process.env.BONITA_ENABLED = env;
    const app = buildServer();
    await app.ready();
    const res = await request(app.server).get('/admin/state');
    expect(res.body.config).toEqual({ bonitaEnabled: expected });
    await app.close();
  });
});
