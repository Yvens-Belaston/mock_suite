import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const AUTH = 'Basic ' + Buffer.from('bonita:geheim').toString('base64');
const SANNE = 'sanne.devries@demo-amsterdam.onmicrosoft.com';
const PIETER = 'pieter.bakker@demo-amsterdam.onmicrosoft.com';

describe('TOPdesk auth and version', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('GET /tas/api/version answers the mock version with any Basic credentials', async () => {
    const res = await request(app.server).get('/tas/api/version').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: '3.x-mock' });
  });

  it('answers 401 without an Authorization: Basic header', async () => {
    expect((await request(app.server).get('/tas/api/version')).status).toBe(401);
    expect((await request(app.server).get('/tas/api/version').set('Authorization', 'Bearer x')).status).toBe(401);
    expect((await request(app.server).get(`/tas/api/persons?query=email==${PIETER}`)).status).toBe(401);
  });
});

describe('TOPdesk persons', () => {
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

  it('seeds the TOPdesk history: 10 persons, 4 operator groups, 8 incidents (6 closed), 3 closed changes', async () => {
    const { topdesk } = (await request(app.server).get('/admin/state')).body;
    expect(topdesk.persons).toHaveLength(10);
    expect(topdesk.persons.some((p: { email: string }) => p.email === SANNE)).toBe(false);
    expect(topdesk.operatorGroups.map((g: { name: string }) => g.name)).toEqual([
      'Servicedesk',
      'Werkplekbeheer',
      'Facilities',
      'HR',
    ]);
    expect(topdesk.categories.map((c: { name: string }) => c.name)).toEqual(['Personeel', 'Werkplek']);
    expect(topdesk.incidents.map((i: { number: string }) => i.number)).toEqual(
      ['001', '002', '003', '004', '005', '006', '007', '008'].map((n) => `I 2610 ${n}`),
    );
    expect(topdesk.incidents.filter((i: { closed: boolean }) => i.closed)).toHaveLength(6);
    expect(topdesk.changes.map((c: { number: string; processingStatus: string }) => [c.number, c.processingStatus])).toEqual([
      ['C 2610 001', 'simple_closed'],
      ['C 2610 002', 'simple_closed'],
      ['C 2610 003', 'simple_closed'],
    ]);
  });

  describe('GET /tas/api/persons', () => {
    it('finds a seed person by email (FIQL email==x) as a legacy array', async () => {
      const res = await api().get(`/tas/api/persons?query=email==${PIETER}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ firstName: 'Pieter', surName: 'Bakker', email: PIETER, archived: false });
      expect(res.body[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('answers 204 with no body when nobody matches (Sanne is not in the seed)', async () => {
      const res = await api().get(`/tas/api/persons?query=${encodeURIComponent(`email==${SANNE}`)}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    });

    it('answers 206 with pageSize persons when more match than pageSize (default 50)', async () => {
      const all = await api().get('/tas/api/persons');
      expect(all.status).toBe(200);
      expect(all.body).toHaveLength(10);

      const page = await api().get('/tas/api/persons?pageSize=3');
      expect(page.status).toBe(206);
      expect(page.body).toHaveLength(3);

      const last = await api().get('/tas/api/persons?pageSize=3&pageStart=9');
      expect(last.status).toBe(200);
      expect(last.body).toHaveLength(1);
    });

    it('answers 400 for a query on a field it does not know', async () => {
      const res = await api().get('/tas/api/persons?query=shoeSize==42');
      expect(res.status).toBe(400);
      expect(res.body[0].message).toEqual(expect.any(String));
    });
  });

  describe('POST /tas/api/persons', () => {
    const sanne = {
      firstName: 'Sanne',
      surName: 'de Vries',
      email: SANNE,
      networkLoginName: SANNE,
      department: { name: 'Digitalisering' },
    };

    it('creates a person (201) that the email search then finds', async () => {
      const res = await api().post('/tas/api/persons').send(sanne);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ...sanne, dynamicName: 'Sanne de Vries', archived: false });
      expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      const found = await api().get(`/tas/api/persons?query=email==${SANNE}`);
      expect(found.status).toBe(200);
      expect(found.body).toEqual([res.body]);
    });

    it('records the creation in the events log', async () => {
      const res = await api().post('/tas/api/persons').send(sanne);
      expect(app.store.events.at(-1)).toMatchObject({
        system: 'topdesk',
        entity: 'person',
        action: 'created',
        id: res.body.id,
      });
    });

    it('needs only surName (v2 rule; no branch)', async () => {
      const res = await api().post('/tas/api/persons').send({ surName: 'Kaya' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ surName: 'Kaya', dynamicName: 'Kaya', archived: false });
    });

    it('answers 400 without surName', async () => {
      const res = await api().post('/tas/api/persons').send({ firstName: 'Sanne', email: SANNE });
      expect(res.status).toBe(400);
      expect(res.body[0].message).toMatch(/surName/);
    });

    it('answers 400 for an unknown top-level field', async () => {
      const res = await api().post('/tas/api/persons').send({ ...sanne, favouriteColour: 'blauw' });
      expect(res.status).toBe(400);
      expect(res.body[0].message).toMatch(/favouriteColour/);
    });

    it('answers 401 without auth', async () => {
      expect((await request(app.server).post('/tas/api/persons').send(sanne)).status).toBe(401);
    });
  });

  describe('PATCH /tas/api/persons/id/{id}/archive', () => {
    const REASON = '0f4a8c1e-3b7d-4e2a-9c6f-1d2e3f4a5b6c';
    const pieterId = async () => (await api().get(`/tas/api/persons?query=email==${PIETER}`)).body[0].id as string;

    it('archives a person with an archiving reason and returns it with archived:true', async () => {
      const id = await pieterId();
      const res = await api().patch(`/tas/api/persons/id/${id}/archive`).send({ id: REASON });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, email: PIETER, archived: true });
      expect(app.store.events.at(-1)).toMatchObject({ system: 'topdesk', entity: 'person', action: 'updated', id });
    });

    it('accepts a missing archiving reason, with an empty or no body', async () => {
      const id = await pieterId();
      const res = await api().patch(`/tas/api/persons/id/${id}/archive`).send({});
      expect(res.status).toBe(200);
      expect(res.body.archived).toBe(true);

      const other = (await api().get('/tas/api/persons?query=firstName==Julia')).body[0].id;
      const bare = await api().patch(`/tas/api/persons/id/${other}/archive`);
      expect(bare.status).toBe(200);
      expect(bare.body.archived).toBe(true);

      const third = (await api().get('/tas/api/persons?query=firstName==Sem')).body[0].id;
      const emptyJson = await api()
        .patch(`/tas/api/persons/id/${third}/archive`)
        .set('Content-Type', 'application/json')
        .send('');
      expect(emptyJson.status).toBe(200);
    });

    it('answers 400 when the person is already archived', async () => {
      const id = await pieterId();
      await api().patch(`/tas/api/persons/id/${id}/archive`).send({ id: REASON });
      const again = await api().patch(`/tas/api/persons/id/${id}/archive`).send({ id: REASON });
      expect(again.status).toBe(400);
      expect(again.body[0].message).toEqual(expect.any(String));
    });

    it('answers 400 for an unknown top-level field', async () => {
      const id = await pieterId();
      const res = await api().patch(`/tas/api/persons/id/${id}/archive`).send({ reason: 'weg' });
      expect(res.status).toBe(400);
    });

    it('answers 404 for an unknown person', async () => {
      const res = await api().patch('/tas/api/persons/id/00000000-0000-4000-8000-000000000000/archive').send({});
      expect(res.status).toBe(404);
    });

    it('answers 401 without auth', async () => {
      const id = await pieterId();
      expect((await request(app.server).patch(`/tas/api/persons/id/${id}/archive`).send({})).status).toBe(401);
    });

    it('search still includes archived persons unless the query adds ;archived==false', async () => {
      const id = await pieterId();
      await api().patch(`/tas/api/persons/id/${id}/archive`).send({ id: REASON });

      const all = await api().get(`/tas/api/persons?query=email==${PIETER}`);
      expect(all.status).toBe(200);
      expect(all.body[0]).toMatchObject({ id, archived: true });

      const active = await api().get(`/tas/api/persons?query=${encodeURIComponent(`email==${PIETER};archived==false`)}`);
      expect(active.status).toBe(204);
    });
  });
});
