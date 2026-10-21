import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const AUTH = 'Basic ' + Buffer.from('svc-ofelia@demo-amsterdam.onmicrosoft.com:token').toString('base64');

describe('Jira issues API (/rest/api/3)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /myself returns the Ofelia service account', async () => {
    const res = await request(app.server).get('/rest/api/3/myself').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Ofelia Integratie');
    expect(res.body.emailAddress).toBe('svc-ofelia@demo-amsterdam.onmicrosoft.com');
    expect(res.body.accountId).toEqual(expect.any(String));
  });

  it('rejects calls without Basic auth with 401 in the Jira error shape', async () => {
    const res = await request(app.server).get('/rest/api/3/myself').set('Authorization', 'Bearer abc');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ errorMessages: [expect.any(String)], errors: {} });
  });

  it('GET /user/search finds Noor Hendriks by e-mail address', async () => {
    const res = await request(app.server)
      .get('/rest/api/3/user/search')
      .query({ query: 'noor.hendriks@demo-amsterdam.onmicrosoft.com' })
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ displayName: 'Noor Hendriks', accountId: expect.any(String) });
  });

  it('GET /user/search returns an empty array when nobody matches', async () => {
    const res = await request(app.server)
      .get('/rest/api/3/user/search?query=sanne.devries@demo-amsterdam.onmicrosoft.com')
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  describe('GET /issue/{key}', () => {
    it('returns a seeded issue with all fields by default', async () => {
      const res = await request(app.server).get('/rest/api/3/issue/IAM-103').set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        key: 'IAM-103',
        fields: {
          project: { key: 'IAM', name: 'Toegangsbeheer' },
          issuetype: { name: 'Task' },
          summary: expect.any(String),
          status: { name: 'In Progress' },
          labels: [],
        },
      });
    });

    it('returns only the fields asked for in fields=', async () => {
      const res = await request(app.server).get('/rest/api/3/issue/AUTO-102?fields=status,summary').set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(res.body.key).toBe('AUTO-102');
      expect(res.body.fields).toEqual({ status: { name: 'In Progress' }, summary: 'Offboarding koppelen aan Entra' });
    });

    it('leaves out fields prefixed with a minus', async () => {
      const res = await request(app.server).get('/rest/api/3/issue/AUTO-102?fields=*all,-description').set('Authorization', AUTH);
      expect(res.body.fields).not.toHaveProperty('description');
      expect(res.body.fields.summary).toBe('Offboarding koppelen aan Entra');
    });

    it('answers 404 in the Jira error shape for an unknown key', async () => {
      const res = await request(app.server).get('/rest/api/3/issue/IAM-999').set('Authorization', AUTH);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ errorMessages: [expect.any(String)], errors: {} });
    });
  });

  describe('POST /issue', () => {
    beforeEach(async () => {
      await request(app.server).post('/admin/reset');
    });

    it('creates IAM-105 for the onboarding task, in status To Do', async () => {
      const search = await request(app.server)
        .get('/rest/api/3/user/search?query=noor.hendriks@demo-amsterdam.onmicrosoft.com')
        .set('Authorization', AUTH);
      const noor = search.body[0].accountId as string;

      const res = await request(app.server)
        .post('/rest/api/3/issue')
        .set('Authorization', AUTH)
        .send({
          fields: {
            project: { key: 'IAM' },
            issuetype: { name: 'Task' },
            summary: 'SAP-toegang voor Sanne de Vries',
            description: ADF,
            assignee: { accountId: noor },
            labels: ['case-1042'],
            duedate: '2026-11-28',
          },
        });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        key: 'IAM-105',
        self: expect.stringMatching(new RegExp(`/rest/api/3/issue/${res.body.id}$`)),
      });

      const issue = await request(app.server).get('/rest/api/3/issue/IAM-105').set('Authorization', AUTH);
      expect(issue.status).toBe(200);
      expect(issue.body).toMatchObject({
        id: res.body.id,
        key: 'IAM-105',
        fields: {
          summary: 'SAP-toegang voor Sanne de Vries',
          description: ADF,
          labels: ['case-1042'],
          assignee: { accountId: noor, displayName: 'Noor Hendriks' },
          status: { name: 'To Do' },
        },
      });
    });

    it('numbers keys per project and starts again from the seed after reset', async () => {
      const keys: string[] = [];
      for (const project of ['IAM', 'AUTO', 'IAM']) {
        const res = await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send(minimal(project));
        keys.push(res.body.key);
      }
      expect(keys).toEqual(['IAM-105', 'AUTO-105', 'IAM-106']);

      await request(app.server).post('/admin/reset');
      const again = await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send(minimal('IAM'));
      expect(again.body.key).toBe('IAM-105');
    });

    it('records a jira issue created event for the screens', async () => {
      await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send(minimal('AUTO'));
      const state = await request(app.server).get('/admin/state');
      expect(state.body.events).toEqual([
        expect.objectContaining({ system: 'jira', entity: 'issue', action: 'created', id: 'AUTO-105' }),
      ]);
    });

    it.each([
      ['project', { issuetype: { name: 'Task' }, summary: 'x' }],
      ['issuetype', { project: { key: 'IAM' }, summary: 'x' }],
      ['summary', { project: { key: 'IAM' }, issuetype: { name: 'Task' } }],
    ])('rejects a missing %s with 400 naming the field', async (field, fields) => {
      const res = await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send({ fields });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ errorMessages: [], errors: { [field]: expect.any(String) } });
    });

    it('rejects an unknown project with 400', async () => {
      const res = await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send(minimal('HR'));
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({ project: expect.any(String) });
    });

    it('rejects a plain-string description (v3 requires ADF) and creates nothing', async () => {
      const body = minimal('IAM');
      const res = await request(app.server)
        .post('/rest/api/3/issue')
        .set('Authorization', AUTH)
        .send({ fields: { ...body.fields, description: 'Geef Sanne SAP-toegang' } });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({ description: expect.any(String) });

      const next = await request(app.server).post('/rest/api/3/issue').set('Authorization', AUTH).send(body);
      expect(next.body.key).toBe('IAM-105');
    });

    it('accepts and ignores unknown fields', async () => {
      const body = minimal('IAM');
      const res = await request(app.server)
        .post('/rest/api/3/issue')
        .set('Authorization', AUTH)
        .send({ fields: body.fields, update: {}, somethingElse: true });
      expect(res.status).toBe(201);
    });
  });
});

const ADF = {
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rol SAP-Inkoop toekennen.' }] }],
};

function minimal(project: string) {
  return { fields: { project: { key: project }, issuetype: { name: 'Task' }, summary: 'Testtaak' } };
}
