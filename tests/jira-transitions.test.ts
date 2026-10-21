import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { transitionIssue } from '../src/routes/jira.js';

const AUTH = 'Basic ' + Buffer.from('svc-ofelia@demo-amsterdam.onmicrosoft.com:token').toString('base64');
const ADF = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rechten toegekend.' }] }] };

describe('Jira comments and transitions (/rest/api/3)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  beforeEach(() => {
    app.store.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /issue/{key}/transitions lists To Do, In Progress and Done with their target status', async () => {
    const res = await request(app.server).get('/rest/api/3/issue/IAM-104/transitions').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.transitions).toHaveLength(3);
    expect(res.body.transitions.map((t: any) => [t.id, t.name, t.to.name])).toEqual([
      ['11', 'To Do', 'To Do'],
      ['21', 'In Progress', 'In Progress'],
      ['31', 'Done', 'Done'],
    ]);
    expect(res.body.transitions[0].to.id).toBe('1');
  });

  it('POST /issue/{key}/transitions with id 31 answers 204 and the issue is Done', async () => {
    const res = await request(app.server)
      .post('/rest/api/3/issue/IAM-104/transitions')
      .set('Authorization', AUTH)
      .send({ transition: { id: '31' } });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const issue = await request(app.server).get('/rest/api/3/issue/IAM-104').set('Authorization', AUTH);
    expect(issue.body.fields.status.name).toBe('Done');
  });

  it('moves an issue through To Do -> In Progress -> Done and emits an issue update each time', async () => {
    for (const [id, status] of [['21', 'In Progress'], ['31', 'Done'], ['11', 'To Do']]) {
      const res = await request(app.server)
        .post('/rest/api/3/issue/AUTO-103/transitions')
        .set('Authorization', AUTH)
        .send({ transition: { id } });
      expect(res.status).toBe(204);
      const issue = await request(app.server).get('/rest/api/3/issue/AUTO-103').set('Authorization', AUTH);
      expect(issue.body.fields.status.name).toBe(status);
    }
    const updates = app.store.events.filter((e) => e.system === 'jira' && e.entity === 'issue' && e.id === 'AUTO-103');
    expect(updates.map((e) => e.action)).toEqual(['updated', 'updated', 'updated']);
  });

  it('rejects an unknown transition id with 400 in the Jira error shape and leaves the status alone', async () => {
    const res = await request(app.server)
      .post('/rest/api/3/issue/IAM-104/transitions')
      .set('Authorization', AUTH)
      .send({ transition: { id: '99' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errorMessages: [expect.any(String)], errors: {} });

    const issue = await request(app.server).get('/rest/api/3/issue/IAM-104').set('Authorization', AUTH);
    expect(issue.body.fields.status.name).toBe('To Do');
  });

  it('rejects a body without transition.id with 400', async () => {
    const res = await request(app.server).post('/rest/api/3/issue/IAM-104/transitions').set('Authorization', AUTH).send({});
    expect(res.status).toBe(400);
    expect(res.body.errorMessages).toEqual(expect.any(Array));
  });

  it('transitionIssue(store, key, id) moves the issue by target status and reports unknown ids', async () => {
    const done = await transitionIssue(app.store, 'IAM-104', '31');
    expect(done.ok && done.transition.to.name).toBe('Done');
    expect(done.ok && done.issue.fields.status.name).toBe('Done');
    expect(await transitionIssue(app.store, 'IAM-104', '99')).toEqual({ ok: false, reason: 'unknown_transition' });
    expect(await transitionIssue(app.store, 'IAM-999', '31')).toEqual({ ok: false, reason: 'issue_not_found' });
  });

  it('POST /issue/{key}/comment with an ADF body answers 201 with the comment', async () => {
    const res = await request(app.server)
      .post('/rest/api/3/issue/IAM-104/comment')
      .set('Authorization', AUTH)
      .send({ body: ADF });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), body: ADF, author: { displayName: 'Ofelia Integratie' } });
    expect(res.body.created).toEqual(expect.any(String));
    expect(res.body.self).toContain('/rest/api/3/issue/10104/comment/');
    const updates = app.store.events.filter((e) => e.system === 'jira' && e.id === 'IAM-104');
    expect(updates.map((e) => e.action)).toEqual(['updated']);
  });

  it('rejects a plain-string comment body with 400 keyed on body', async () => {
    const res = await request(app.server)
      .post('/rest/api/3/issue/IAM-104/comment')
      .set('Authorization', AUTH)
      .send({ body: 'Rechten toegekend.' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ errorMessages: [], errors: { body: expect.any(String) } });
  });

  it('answers 404 when commenting on an unknown issue', async () => {
    const res = await request(app.server)
      .post('/rest/api/3/issue/IAM-999/comment')
      .set('Authorization', AUTH)
      .send({ body: ADF });
    expect(res.status).toBe(404);
  });

  it('answers 404 for transitions on an unknown issue', async () => {
    const get = await request(app.server).get('/rest/api/3/issue/IAM-999/transitions').set('Authorization', AUTH);
    expect(get.status).toBe(404);
    const post = await request(app.server)
      .post('/rest/api/3/issue/IAM-999/transitions')
      .set('Authorization', AUTH)
      .send({ transition: { id: '31' } });
    expect(post.status).toBe(404);
    expect(post.body.errorMessages).toEqual(['Issue does not exist or you do not have permission to see it.']);
  });
});
