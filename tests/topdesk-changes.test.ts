import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const AUTH = 'Basic ' + Buffer.from('bonita:geheim').toString('base64');
const PIETER_ID = 'a1d0e5c0-0000-4000-8000-000000000001';
const PIETER = 'pieter.bakker@demo-amsterdam.onmicrosoft.com';
const LAPTOP = { requester: { id: PIETER_ID }, briefDescription: 'Laptop voorbereiden Pieter Bakker', changeType: 'simple' };

describe('TOPdesk operator changes', () => {
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

  it('POST creates a change: 201, next number after the seed, status simple_notStarted', async () => {
    const res = await api().post('/tas/api/operatorChanges').send(LAPTOP);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: 'C 2610 004',
      briefDescription: 'Laptop voorbereiden Pieter Bakker',
      changeType: 'simple',
      processingStatus: 'simple_notStarted',
      requester: { id: PIETER_ID, name: 'Pieter Bakker' },
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST resolves the requester by identifier (email) or takes a free name', async () => {
    const byEmail = await api().post('/tas/api/operatorChanges').send({ ...LAPTOP, requester: { identifier: PIETER } });
    expect(byEmail.status).toBe(201);
    expect(byEmail.body.requester).toEqual({ id: PIETER_ID, name: 'Pieter Bakker' });
    const byName = await api().post('/tas/api/operatorChanges').send({ ...LAPTOP, requester: { name: 'Nieuwe Collega' } });
    expect(byName.status).toBe(201);
    expect(byName.body.requester.name).toBe('Nieuwe Collega');
  });

  it('POST with a template does not need briefDescription or changeType', async () => {
    const res = await api().post('/tas/api/operatorChanges').send({ requester: { id: PIETER_ID }, template: { number: 'WT 0001' } });
    expect(res.status).toBe(201);
    expect(res.body.processingStatus).toBe('simple_notStarted');
  });

  it.each([
    ['no requester', { briefDescription: 'x', changeType: 'simple' }],
    ['requester without id/identifier/name', { ...LAPTOP, requester: {} }],
    ['unknown requester id', { ...LAPTOP, requester: { id: 'a1d0e5c0-0000-4000-8000-0000000000ff' } }],
    ['no briefDescription without template', { requester: { id: PIETER_ID }, changeType: 'simple' }],
    ['no changeType without template', { requester: { id: PIETER_ID }, briefDescription: 'x' }],
    ['unknown field', { ...LAPTOP, colour: 'red' }],
  ])('POST answers 400 for %s', async (_case, body) => {
    const res = await api().post('/tas/api/operatorChanges').send(body);
    expect(res.status).toBe(400);
    expect(res.body[0].message).toEqual(expect.any(String));
  });

  it('GET /operatorChanges/{id} returns the change, or 404', async () => {
    const created = await api().post('/tas/api/operatorChanges').send(LAPTOP);
    const res = await api().get(`/tas/api/operatorChanges/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: 'C 2610 004', processingStatus: 'simple_notStarted' });
    const seed = await api().get('/tas/api/operatorChanges/e5b0c9a0-0000-4000-8000-000000000001');
    expect(seed.body.number).toBe('C 2610 001');
    expect((await api().get('/tas/api/operatorChanges/e5b0c9a0-0000-4000-8000-0000000000ff')).status).toBe(404);
  });

  describe('processingStatusTransitions', () => {
    const transition = (id: string, from: string, action: string) =>
      api().post(`/tas/api/operatorChanges/${id}/processingStatusTransitions`).send({ from, action });
    const status = async (id: string) => (await api().get(`/tas/api/operatorChanges/${id}`)).body.processingStatus;

    it('moves start -> implement -> close, each 201', async () => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      expect((await transition(body.id, 'simple_notStarted', 'start')).status).toBe(201);
      expect(await status(body.id)).toBe('simple_inProgress');
      expect((await transition(body.id, 'simple_inProgress', 'implement')).status).toBe(201);
      expect(await status(body.id)).toBe('simple_done');
      expect((await transition(body.id, 'simple_done', 'close')).status).toBe(201);
      expect(await status(body.id)).toBe('simple_closed');
    });

    it('answers 400 when from is not the current status, or the action is unknown or not allowed', async () => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      expect((await transition(body.id, 'simple_inProgress', 'implement')).status).toBe(400);
      expect((await transition(body.id, 'simple_notStarted', 'fly')).status).toBe(400);
      expect((await transition(body.id, 'simple_notStarted', 'close')).status).toBe(400);
      expect(await status(body.id)).toBe('simple_notStarted');
    });

    it('answers 404 for an unknown change', async () => {
      const res = await transition('e5b0c9a0-0000-4000-8000-0000000000ff', 'simple_notStarted', 'start');
      expect(res.status).toBe(404);
    });
  });

  const trailOf = async (id: string): Promise<string[]> => {
    const state = (await request(app.server).get('/admin/state')).body;
    return state.topdesk.changes.find((c: { id: string }) => c.id === id).progressTrail.map((e: { text: string }) => e.text);
  };

  describe('PATCH (JSON Patch)', () => {
    const patch = (id: string, ops: unknown) =>
      api().patch(`/tas/api/operatorChanges/${id}`).set('Content-Type', 'application/json-patch+json').send(JSON.stringify(ops));

    it('add /progressTrail appends a note: 204 without body', async () => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      const res = await patch(body.id, [{ op: 'add', path: '/progressTrail', value: 'Laptop besteld' }]);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await trailOf(body.id)).toContain('Laptop besteld');
    });

    it.each([
      ['replace /processingStatus', [{ op: 'replace', path: '/processingStatus', value: 'simple_done' }]],
      ['add /processingStatus', [{ op: 'add', path: '/processingStatus', value: 'simple_done' }]],
      ['remove /progressTrail', [{ op: 'remove', path: '/progressTrail' }]],
      ['add /progressTrail without a text value', [{ op: 'add', path: '/progressTrail' }]],
      ['a non-array body', { op: 'add', path: '/progressTrail', value: 'x' }],
    ])('answers 400 for %s and changes nothing', async (_case, ops) => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      const res = await patch(body.id, ops);
      expect(res.status).toBe(400);
      expect((await api().get(`/tas/api/operatorChanges/${body.id}`)).body.processingStatus).toBe('simple_notStarted');
      expect(await trailOf(body.id)).toEqual(['Change aangemaakt']);
    });

    it('answers 415 for a plain application/json body', async () => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      const res = await api().patch(`/tas/api/operatorChanges/${body.id}`).send([{ op: 'add', path: '/progressTrail', value: 'x' }]);
      expect(res.status).toBe(415);
    });

    it('answers 404 for an unknown change', async () => {
      const res = await patch('e5b0c9a0-0000-4000-8000-0000000000ff', [{ op: 'add', path: '/progressTrail', value: 'x' }]);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /operatorChanges/{id}/progresstrail', () => {
    const memo = (id: string, body: unknown) => api().post(`/tas/api/operatorChanges/${id}/progresstrail`).send(body as object);

    it('adds a memo: 201', async () => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      const res = await memo(body.id, { memoText: 'Laptop klaargezet', type: 'memo' });
      expect(res.status).toBe(201);
      expect(await trailOf(body.id)).toContain('Laptop klaargezet');
    });

    it.each([
      ['no memoText', { type: 'memo' }],
      ['no type', { memoText: 'x' }],
      ['another type', { memoText: 'x', type: 'attachment' }],
      ['a bad textFormatting', { memoText: 'x', type: 'memo', textFormatting: 'rtf' }],
    ])('answers 400 for %s', async (_case, payload) => {
      const { body } = await api().post('/tas/api/operatorChanges').send(LAPTOP);
      expect((await memo(body.id, payload)).status).toBe(400);
    });

    it('answers 404 for an unknown change', async () => {
      const res = await memo('e5b0c9a0-0000-4000-8000-0000000000ff', { memoText: 'x', type: 'memo' });
      expect(res.status).toBe(404);
    });
  });
});
