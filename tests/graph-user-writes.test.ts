import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const AUTH = { authorization: 'Bearer mock-token' };
const PIETER = '7d2f0c1a-0001-4b6e-9c3d-000000000001';
const PIETER_UPN = 'pieter.bakker@demo-amsterdam.onmicrosoft.com';
const FATIMA = '7d2f0c1a-0002-4b6e-9c3d-000000000002';
const LOTTE = '7d2f0c1a-0004-4b6e-9c3d-000000000004';
const RUBEN = '7d2f0c1a-0005-4b6e-9c3d-000000000005';
const M365_E3 = '05e9a617-0261-4cee-bb44-138d3ef5d965';
const VISIO = 'c5928f49-12ba-48f7-ada3-0d743a3601d5';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

const sanne = {
  accountEnabled: true,
  displayName: 'Sanne de Vries',
  givenName: 'Sanne',
  surname: 'de Vries',
  mailNickname: 'sanne.devries',
  userPrincipalName: 'sanne.devries@demo-amsterdam.onmicrosoft.com',
  jobTitle: 'Beleidsmedewerker',
  department: 'Digitalisering',
  usageLocation: 'NL',
  passwordProfile: { forceChangePasswordNextSignIn: true, password: 'Welkom-2026!' },
};

let app: FastifyInstance;

beforeEach(async () => {
  app = buildServer();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const api = () => request(app.server);
const getUser = (x: string, select = 'id,displayName,accountEnabled,usageLocation,assignedLicenses,department') =>
  api().get(`/v1.0/users/${encodeURIComponent(x)}?$select=${select}`).set(AUTH);
const lastEvent = () => app.store.events.at(-1);

describe('POST /v1.0/users', () => {
  it('creates the user, answers 201 with the user and never echoes the password', async () => {
    const res = await api().post('/v1.0/users').set(AUTH).send(sanne);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users/$entity',
      displayName: 'Sanne de Vries',
      userPrincipalName: 'sanne.devries@demo-amsterdam.onmicrosoft.com',
      jobTitle: 'Beleidsmedewerker',
    });
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.stringify(res.body)).not.toContain('Welkom-2026!');
    expect(res.body.passwordProfile).toBeUndefined();

    const read = await getUser(sanne.userPrincipalName);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: res.body.id, accountEnabled: true, department: 'Digitalisering', assignedLicenses: [] });
    expect(JSON.stringify(app.store.get().graph)).not.toContain('Welkom-2026!');
    expect(lastEvent()).toMatchObject({ system: 'graph', entity: 'user', action: 'created', id: res.body.id });
  });

  it.each(['accountEnabled', 'displayName', 'mailNickname', 'userPrincipalName'])(
    'answers 400 when %s is missing and creates nothing',
    async (field) => {
      const body: Record<string, unknown> = { ...sanne };
      delete body[field];
      const res = await api().post('/v1.0/users').set(AUTH).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('Request_BadRequest');
      expect(res.body.error.message).toContain(field);
      expect((await getUser(sanne.userPrincipalName)).status).toBe(404);
    },
  );

  it('answers 400 when passwordProfile.password is missing', async () => {
    const res = await api()
      .post('/v1.0/users')
      .set(AUTH)
      .send({ ...sanne, passwordProfile: { forceChangePasswordNextSignIn: true } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('passwordProfile.password');
  });

  it('answers 400 Request_BadRequest "already exists" for a duplicate UPN (case-insensitive)', async () => {
    const res = await api().post('/v1.0/users').set(AUTH).send({ ...sanne, userPrincipalName: PIETER_UPN.toUpperCase() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('Request_BadRequest');
    expect(res.body.error.message).toContain('already exists');
  });

  it('answers 401 without a bearer token', async () => {
    expect((await api().post('/v1.0/users').send(sanne)).status).toBe(401);
  });
});

describe('PATCH /v1.0/users/{x}', () => {
  it.each([
    ['id', PIETER],
    ['UPN', PIETER_UPN],
  ])('disables the account by %s with 204 and no body', async (_kind, x) => {
    const res = await api()
      .patch(`/v1.0/users/${encodeURIComponent(x)}`)
      .set(AUTH)
      .send({ accountEnabled: false, department: 'Bestuur' });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await getUser(PIETER)).body).toMatchObject({ accountEnabled: false, department: 'Bestuur', displayName: 'Pieter Bakker' });
    expect(lastEvent()).toMatchObject({ system: 'graph', entity: 'user', action: 'updated', id: PIETER });
  });

  it('answers 404 for an unknown user', async () => {
    const res = await api().patch(`/v1.0/users/${UNKNOWN}`).set(AUTH).send({ accountEnabled: false });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('Request_ResourceNotFound');
  });

  it('answers 400 for an empty or non-object body', async () => {
    expect((await api().patch(`/v1.0/users/${PIETER}`).set(AUTH).send({})).status).toBe(400);
    expect((await api().patch(`/v1.0/users/${PIETER}`).set(AUTH).send([1])).status).toBe(400);
  });

  it('answers 400 "already exists" when renaming to a UPN another user has', async () => {
    const res = await api().patch(`/v1.0/users/${FATIMA}`).set(AUTH).send({ userPrincipalName: PIETER_UPN });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('already exists');
  });
});

/** Stored user from the public admin state (the only place `managerId` / `signInSessionsRevokedAt` show). */
async function storedUser(id: string): Promise<Record<string, unknown>> {
  const state = await api().get('/admin/state');
  return state.body.graph.users.find((u: { id: string }) => u.id === id);
}

describe('PUT /v1.0/users/{id}/manager/$ref', () => {
  it('sets the manager from an @odata.id ending in the user id, 204', async () => {
    const res = await api()
      .put(`/v1.0/users/${LOTTE}/manager/$ref`)
      .set(AUTH)
      .send({ '@odata.id': `https://graph.microsoft.com/v1.0/users/${PIETER}` });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await storedUser(LOTTE)).toMatchObject({ managerId: PIETER });
    expect(lastEvent()).toMatchObject({ system: 'graph', entity: 'user', action: 'updated', id: LOTTE });
  });

  it('answers 400 when @odata.id is missing', async () => {
    const res = await api().put(`/v1.0/users/${LOTTE}/manager/$ref`).set(AUTH).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('Request_BadRequest');
  });

  it('answers 404 for an unknown user or an unknown manager', async () => {
    const body = { '@odata.id': `https://graph.microsoft.com/v1.0/users/${PIETER}` };
    expect((await api().put(`/v1.0/users/${UNKNOWN}/manager/$ref`).set(AUTH).send(body)).status).toBe(404);
    const res = await api()
      .put(`/v1.0/users/${LOTTE}/manager/$ref`)
      .set(AUTH)
      .send({ '@odata.id': `https://graph.microsoft.com/v1.0/users/${UNKNOWN}` });
    expect(res.status).toBe(404);
    expect((await storedUser(LOTTE)).managerId).toBe(RUBEN);
  });

  it('takes the user id only, not the UPN (as documented)', async () => {
    const body = { '@odata.id': `https://graph.microsoft.com/v1.0/users/${PIETER}` };
    const fatimaUpn = 'fatima.elamrani@demo-amsterdam.onmicrosoft.com';
    expect((await api().put(`/v1.0/users/${fatimaUpn}/manager/$ref`).set(AUTH).send(body)).status).toBe(404);
  });
});

describe('POST /v1.0/users/{x}/assignLicense', () => {
  const licences = async (x: string) => (await getUser(x, 'assignedLicenses')).body.assignedLicenses;

  it('assigns M365_E3 to a new hire by UPN and answers 200 with the user', async () => {
    await api().post('/v1.0/users').set(AUTH).send(sanne);
    const res = await api()
      .post(`/v1.0/users/${sanne.userPrincipalName}/assignLicense`)
      .set(AUTH)
      .send({ addLicenses: [{ disabledPlans: [], skuId: M365_E3 }], removeLicenses: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: 'Sanne de Vries', userPrincipalName: sanne.userPrincipalName });
    expect(await licences(sanne.userPrincipalName)).toEqual([{ skuId: M365_E3 }]);
    expect(lastEvent()).toMatchObject({ system: 'graph', entity: 'user', action: 'updated', id: res.body.id });
  });

  it('removes licences by skuId and does not duplicate an already assigned one', async () => {
    const res = await api()
      .post(`/v1.0/users/${PIETER}/assignLicense`)
      .set(AUTH)
      .send({ addLicenses: [{ skuId: M365_E3 }], removeLicenses: [VISIO] });
    expect(res.status).toBe(200);
    expect(await licences(PIETER)).toEqual([{ skuId: M365_E3 }]);
  });

  it.each(['addLicenses', 'removeLicenses'])('answers 400 when %s is missing', async (field) => {
    const body: Record<string, unknown> = { addLicenses: [{ skuId: VISIO }], removeLicenses: [] };
    delete body[field];
    const res = await api().post(`/v1.0/users/${FATIMA}/assignLicense`).set(AUTH).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(field);
  });

  it('answers 400 for a user without usageLocation and assigns nothing', async () => {
    const { usageLocation: _omit, ...noLocation } = sanne;
    await api().post('/v1.0/users').set(AUTH).send(noLocation);
    const res = await api()
      .post(`/v1.0/users/${sanne.userPrincipalName}/assignLicense`)
      .set(AUTH)
      .send({ addLicenses: [{ skuId: M365_E3 }], removeLicenses: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('usage location');
    expect(await licences(sanne.userPrincipalName)).toEqual([]);
  });

  it('answers 400 for an unknown skuId', async () => {
    const res = await api()
      .post(`/v1.0/users/${FATIMA}/assignLicense`)
      .set(AUTH)
      .send({ addLicenses: [{ skuId: UNKNOWN }], removeLicenses: [] });
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown user', async () => {
    const res = await api()
      .post(`/v1.0/users/${UNKNOWN}/assignLicense`)
      .set(AUTH)
      .send({ addLicenses: [], removeLicenses: [] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('Request_ResourceNotFound');
  });
});

describe('POST /v1.0/users/{x}/revokeSignInSessions', () => {
  it.each([
    ['id', PIETER],
    ['UPN', PIETER_UPN],
  ])('revokes sessions by %s with an empty body: 200 {"value":true}', async (_kind, x) => {
    const before = Date.now();
    const res = await api().post(`/v1.0/users/${x}/revokeSignInSessions`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#Edm.Boolean', value: true });
    const revokedAt = (await storedUser(PIETER)).signInSessionsRevokedAt as string;
    expect(Date.parse(revokedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(lastEvent()).toMatchObject({ system: 'graph', entity: 'user', action: 'updated', id: PIETER });
  });

  it('accepts a JSON body too (e.g. {})', async () => {
    expect((await api().post(`/v1.0/users/${PIETER}/revokeSignInSessions`).set(AUTH).send({})).status).toBe(200);
  });

  it('answers 404 for an unknown user', async () => {
    const res = await api().post(`/v1.0/users/${UNKNOWN}/revokeSignInSessions`).set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('Request_ResourceNotFound');
  });
});

describe('offboarding example from the ticket', () => {
  it('disables the account and ends the sessions, both visible on reset-free state', async () => {
    expect((await api().patch(`/v1.0/users/${PIETER}`).set(AUTH).send({ accountEnabled: false })).status).toBe(204);
    expect((await api().post(`/v1.0/users/${PIETER}/revokeSignInSessions`).set(AUTH)).body.value).toBe(true);
    expect(await storedUser(PIETER)).toMatchObject({ accountEnabled: false, signInSessionsRevokedAt: expect.any(String) });
    expect((await getUser(PIETER, 'signInSessionsRevokedAt,managerId')).body).not.toHaveProperty('signInSessionsRevokedAt');
  });
});
