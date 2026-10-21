import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { resetBonitaClient } from '../src/bonita.js';
import { startBonitaStub, type BonitaStub } from './helpers/bonita-stub.js';

const AUTH = 'Basic ' + Buffer.from('svc-ofelia@demo-amsterdam.onmicrosoft.com:token').toString('base64');
const NOOR = '712020:5f1c2a7e-0b3d-4c1e-9a6f-1d2e3f4a5b01';
const DONE = '31';

describe('Callback B: Jira issue moved to Done notifies Bonita', () => {
  let app: FastifyInstance;
  let stub: BonitaStub;
  let messageStatus = 204;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    stub = await startBonitaStub({
      routes: (s) => s.post('/bonita/API/bpm/message', async (_req, reply) => reply.code(messageStatus).send()),
    });
    app = buildServer();
    await app.ready();
  });

  beforeEach(() => {
    app.store.reset();
    stub.calls.length = 0;
    messageStatus = 204;
    process.env.BONITA_URL = stub.url;
    delete process.env.BONITA_ENABLED;
    delete process.env.BONITA_MESSAGE_ACCESS;
    delete process.env.BONITA_ONBOARDING_PROCESS;
    resetBonitaClient();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    resetBonitaClient();
  });

  afterAll(async () => {
    await app.close();
    await stub.close();
  });

  async function createIssue(fields: Record<string, unknown>): Promise<string> {
    const res = await request(app.server)
      .post('/rest/api/3/issue')
      .set('Authorization', AUTH)
      .send({ fields: { project: { key: 'IAM' }, issuetype: { name: 'Task' }, summary: 'Toegang SAP voor Noor', ...fields } });
    expect(res.status).toBe(201);
    return res.body.key;
  }

  async function moveToDone(key: string) {
    const res = await request(app.server)
      .post(`/rest/api/3/issue/${key}/transitions`)
      .set('Authorization', AUTH)
      .send({ transition: { id: DONE } });
    expect(res.status).toBe(204);
  }

  const messageCalls = () => stub.calls.filter((c) => c.url === '/bonita/API/bpm/message');

  it('sends accessGranted with the case id as a Long and the issue key to Bonita', async () => {
    const key = await createIssue({ labels: ['case-1042'], assignee: { accountId: NOOR } });

    await moveToDone(key);

    expect(messageCalls()).toHaveLength(1);
    expect(messageCalls()[0].method).toBe('POST');
    expect(messageCalls()[0].body).toEqual({
      messageName: 'accessGranted',
      targetProcess: 'MedewerkerOnboarding',
      correlations: {
        caseId: { value: '1042', type: 'java.lang.Long' },
        issueKey: { value: key, type: 'java.lang.String' },
      },
      messageContent: {
        issueKey: { value: key, type: 'java.lang.String' },
        resolvedBy: { value: 'Noor Hendriks', type: 'java.lang.String' },
      },
    });
  });

  it('stores an ok result on the issue and emits callback_ok when Bonita answers 204', async () => {
    const key = await createIssue({ labels: ['case-1042'], assignee: { accountId: NOOR } });

    await moveToDone(key);

    const issue = issueInState(key);
    expect(issue.bonitaCallback).toMatchObject({ status: 'ok', httpStatus: 204 });
    expect(Number.isNaN(Date.parse(issue.bonitaCallback.at))).toBe(false);
    expect(app.store.events.filter((e) => e.id === key).map((e) => e.action)).toContain('callback_ok');
  });

  it('sends nothing for an issue without a case label', async () => {
    const key = await createIssue({ labels: ['onboarding'] });

    await moveToDone(key);

    expect(stub.calls).toHaveLength(0);
    expect(issueInState(key).bonitaCallback).toBeUndefined();
  });

  it('records an error result and emits callback_error when Bonita answers 500', async () => {
    messageStatus = 500;
    const key = await createIssue({ labels: ['case-1042'] });

    await moveToDone(key);

    expect(issueInState(key).bonitaCallback).toMatchObject({ status: 'error', httpStatus: 500 });
    expect(app.store.events.filter((e) => e.id === key).map((e) => e.action)).toContain('callback_error');
  });

  it('sends resolvedBy "Onbekend" when the issue is unassigned', async () => {
    const key = await createIssue({ labels: ['case-7'] });

    await moveToDone(key);

    expect(messageCalls()[0].body).toMatchObject({
      correlations: { caseId: { value: '7', type: 'java.lang.Long' } },
      messageContent: { resolvedBy: { value: 'Onbekend', type: 'java.lang.String' } },
    });
  });

  it('uses BONITA_MESSAGE_ACCESS and BONITA_ONBOARDING_PROCESS when set', async () => {
    process.env.BONITA_MESSAGE_ACCESS = 'toegangVerleend';
    process.env.BONITA_ONBOARDING_PROCESS = 'Onboarding2';
    const key = await createIssue({ labels: ['case-1042'] });

    await moveToDone(key);

    expect(messageCalls()[0].body).toMatchObject({ messageName: 'toegangVerleend', targetProcess: 'Onboarding2' });
  });

  it('skips the callback when BONITA_ENABLED=false but still moves the issue', async () => {
    process.env.BONITA_ENABLED = 'false';
    const key = await createIssue({ labels: ['case-1042'] });

    await moveToDone(key);

    expect(stub.calls).toHaveLength(0);
    expect(issueInState(key).fields.status.name).toBe('Done');
    expect(issueInState(key).bonitaCallback).toBeUndefined();
  });

  it('records an error (no crash) when Bonita cannot be reached', async () => {
    process.env.BONITA_URL = 'http://127.0.0.1:1/bonita';
    const key = await createIssue({ labels: ['case-1042'] });

    await moveToDone(key);

    expect(issueInState(key).bonitaCallback).toMatchObject({ status: 'error', httpStatus: null });
  });

  function issueInState(key: string): any {
    return (app.store.get().jira.issues as any[]).find((i) => i.key === key);
  }
});
