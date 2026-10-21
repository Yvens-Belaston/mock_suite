import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { createIncident } from '../src/routes/topdesk-incidents.js';

const AUTH = 'Basic ' + Buffer.from('bonita:geheim').toString('base64');
const FATIMA = 'fatima.elamrani@demo-amsterdam.onmicrosoft.com';
const FATIMA_ID = 'a1d0e5c0-0000-4000-8000-000000000002';

describe('TOPdesk incidents', () => {
  let app: FastifyInstance;
  const api = () => ({
    get: (url: string) => request(app.server).get(url).set('Authorization', AUTH),
    post: (url: string) => request(app.server).post(url).set('Authorization', AUTH),
    patch: (url: string) => request(app.server).patch(url).set('Authorization', AUTH),
  });
  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('POST creates an incident numbered after the seed (I 2610 009, 010) with the looked-up caller', async () => {
    const res = await api()
      .post('/tas/api/incidents')
      .send({ briefDescription: 'Indiensttreding Sanne de Vries', callerLookup: { email: FATIMA } });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('I 2610 009');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.briefDescription).toBe('Indiensttreding Sanne de Vries');
    expect(res.body.caller).toMatchObject({ id: FATIMA_ID, dynamicName: 'Fatima El Amrani' });
    expect(res.body.closed).toBe(false);
    expect(res.body.action).toBe(`/tas/api/incidents/id/${res.body.id}/actions`);
    expect(res.body.actions).toBeUndefined();

    const second = await api().post('/tas/api/incidents').send({ briefDescription: 'Tweede', caller: { id: FATIMA_ID } });
    expect(second.status).toBe(201);
    expect(second.body.number).toBe('I 2610 010');
  });

  it.each([
    ['no briefDescription', { callerLookup: { email: FATIMA } }],
    ['briefDescription over 80 chars', { briefDescription: 'x'.repeat(81), callerLookup: { email: FATIMA } }],
    ['no caller', { briefDescription: 'Test' }],
    ['callerLookup with both id and email', { briefDescription: 'Test', callerLookup: { id: FATIMA_ID, email: FATIMA } }],
    ['callerLookup with neither', { briefDescription: 'Test', callerLookup: {} }],
    ['unknown caller email', { briefDescription: 'Test', callerLookup: { email: 'niemand@example.com' } }],
    ['an unknown top-level field', { briefDescription: 'Test', callerLookup: { email: FATIMA }, foo: 1 }],
  ])('POST answers 400 [{message}] for %s', async (_name, body) => {
    const res = await api().post('/tas/api/incidents').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual([{ message: expect.any(String) }]);
  });

  it('POST accepts a briefDescription of exactly 80 chars', async () => {
    const res = await api()
      .post('/tas/api/incidents')
      .send({ briefDescription: 'x'.repeat(80), callerLookup: { id: FATIMA_ID } });
    expect(res.status).toBe(201);
  });

  it('GET by id and by URL-encoded number return the incident; unknown is 404', async () => {
    const created = await api().post('/tas/api/incidents').send({ briefDescription: 'Zoek mij', callerLookup: { email: FATIMA } });
    const byId = await api().get(`/tas/api/incidents/id/${created.body.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body).toEqual(created.body);
    const byNumber = await api().get('/tas/api/incidents/number/I%202610%20009');
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.id).toBe(created.body.id);
    expect(byNumber.body.actions).toBeUndefined();

    const seeded = await api().get('/tas/api/incidents/number/I%202610%20001');
    expect(seeded.body.briefDescription).toBe('Indiensttreding Mark de Wit');
    expect(seeded.body.action).toBe(`/tas/api/incidents/id/${seeded.body.id}/actions`);

    const missing = await api().get('/tas/api/incidents/id/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual([{ message: expect.any(String) }]);
    expect((await api().get('/tas/api/incidents/number/I%202610%20999')).status).toBe(404);
  });

  it('PATCH by id updates the allowed fields and appends the action to the screen timeline', async () => {
    const created = await api().post('/tas/api/incidents').send({ briefDescription: 'Patch mij', callerLookup: { email: FATIMA } });
    const res = await api()
      .patch(`/tas/api/incidents/id/${created.body.id}`)
      .send({
        action: 'Account aangemaakt',
        processingStatus: { name: 'In behandeling' },
        externalNumber: 'case-42',
        operatorGroup: { name: 'Werkplekbeheer' },
        closed: true,
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      processingStatus: { name: 'In behandeling' },
      externalNumber: 'case-42',
      operatorGroup: { name: 'Werkplekbeheer' },
      closed: true,
      action: `/tas/api/incidents/id/${created.body.id}/actions`,
    });

    const state = await request(app.server).get('/admin/state');
    const stored = state.body.topdesk.incidents.find((i: { id: string }) => i.id === created.body.id);
    expect(stored.actions.at(-1)).toMatchObject({ text: 'Account aangemaakt', author: expect.any(String), date: expect.any(String) });
  });

  it('PATCH by number works; unknown fields are 400 and unknown incidents 404', async () => {
    const res = await api().patch('/tas/api/incidents/number/I%202610%20002').send({ action: 'Laptop uitgeleverd' });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe('I 2610 002');

    const bad = await api().patch('/tas/api/incidents/number/I%202610%20002').send({ briefDescription: 'nee' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual([{ message: expect.any(String) }]);
    expect((await api().patch('/tas/api/incidents/number/I%202610%20999').send({ closed: true })).status).toBe(404);
  });

  it('createIncident (reused by the onboarding form) shares numbering and validation with POST', async () => {
    const result = createIncident(app.store, { briefDescription: 'Via formulier', callerLookup: { email: FATIMA } });
    expect(result.ok && result.incident.number).toBe('I 2610 009');
    expect(createIncident(app.store, { briefDescription: 'Geen caller' })).toMatchObject({ ok: false, status: 400 });
    const res = await api().post('/tas/api/incidents').send({ briefDescription: 'Daarna', caller: { id: FATIMA_ID } });
    expect(res.body.number).toBe('I 2610 010');
    const events = (await request(app.server).get('/admin/state')).body.events;
    expect(events).toContainEqual(expect.objectContaining({ system: 'topdesk', entity: 'incident', action: 'created' }));
  });

  describe('list', () => {
    const create = (briefDescription: string, externalNumber?: string) =>
      api().post('/tas/api/incidents').send({ briefDescription, callerLookup: { email: FATIMA }, externalNumber });

    it('returns 200 with all 8 seeded incidents (default pageSize 10), as API views', async () => {
      const res = await api().get('/tas/api/incidents');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(8);
      expect(res.body[0].actions).toBeUndefined();
      expect(res.body[0].action).toMatch(/^\/tas\/api\/incidents\/id\/.+\/actions$/);
    });

    it('answers 206 with x-next-page-url when more than pageSize match, defaulting to 10', async () => {
      await create('Negen');
      await create('Tien');
      await create('Elf');
      const first = await api().get('/tas/api/incidents');
      expect(first.status).toBe(206);
      expect(first.body).toHaveLength(10);
      expect(first.headers['x-next-page-url']).toContain('pageStart=10');

      const rest = await api().get('/tas/api/incidents?pageStart=10&pageSize=10');
      expect(rest.status).toBe(200);
      expect(rest.body.map((i: { number: string }) => i.number)).toEqual(['I 2610 011']);

      const small = await api().get('/tas/api/incidents?pageSize=3');
      expect(small.status).toBe(206);
      expect(small.body).toHaveLength(3);
    });

    it('filters on closed==false and externalNumber==X; no match is 204 with no body', async () => {
      await create('Met case', 'case-77');
      const open = await api().get('/tas/api/incidents?query=closed==false');
      expect(open.status).toBe(200);
      expect(open.body.map((i: { number: string }) => i.number)).toEqual(['I 2610 007', 'I 2610 008', 'I 2610 009']);

      const byExt = await api().get('/tas/api/incidents?query=externalNumber==case-77');
      expect(byExt.status).toBe(200);
      expect(byExt.body).toHaveLength(1);
      expect(byExt.body[0].briefDescription).toBe('Met case');

      const both = await api().get('/tas/api/incidents?query=closed==true;externalNumber==case-77');
      expect(both.status).toBe(204);
      expect(both.text).toBe('');
    });

    it('rejects FIQL on other fields with 400', async () => {
      const res = await api().get('/tas/api/incidents?query=briefDescription==x');
      expect(res.status).toBe(400);
      expect(res.body).toEqual([{ message: expect.any(String) }]);
    });
  });
});
