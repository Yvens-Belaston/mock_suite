import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const tokenForm = {
  client_id: 'bonita-app',
  client_secret: 's3cret',
  scope: 'https://graph.microsoft.com/.default',
  grant_type: 'client_credentials',
};

describe('Graph token endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a mock bearer token for form-encoded client credentials', async () => {
    const res = await request(app.server).post('/demo-amsterdam/oauth2/v2.0/token').type('form').send(tokenForm);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3599 });
    expect(res.body.access_token).toMatch(/^mock-.+/);
  });

  it.each(['grant_type', 'client_id', 'client_secret', 'scope'])(
    'answers 400 invalid_request in Entra flat shape when %s is missing',
    async (field) => {
      const form: Record<string, string> = { ...tokenForm };
      delete form[field];
      const res = await request(app.server).post('/demo-amsterdam/oauth2/v2.0/token').type('form').send(form);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toContain(field);
    },
  );

  it('accepts client credentials in an Authorization: Basic header', async () => {
    const res = await request(app.server)
      .post('/demo-amsterdam/oauth2/v2.0/token')
      .auth('bonita-app', 's3cret')
      .type('form')
      .send({ scope: tokenForm.scope, grant_type: 'client_credentials' });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toMatch(/^mock-/);
  });
});

const PIETER_UPN = 'pieter.bakker@demo-amsterdam.onmicrosoft.com';
const DEFAULT_FIELDS = [
  'businessPhones',
  'displayName',
  'givenName',
  'id',
  'jobTitle',
  'mail',
  'mobilePhone',
  'officeLocation',
  'preferredLanguage',
  'surname',
  'userPrincipalName',
];

describe('Graph user lookup', () => {
  let app: FastifyInstance;
  const bearer = { Authorization: 'Bearer mock-anything' };

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a seed user by userPrincipalName with only the default field set', async () => {
    const res = await request(app.server).get(`/v1.0/users/${PIETER_UPN}`).set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Pieter Bakker');
    expect(res.body.jobTitle).toBe('Manager Digitalisering');
    expect(res.body.userPrincipalName).toBe(PIETER_UPN);
    expect(Object.keys(res.body).filter((k) => !k.startsWith('@odata')).sort()).toEqual(DEFAULT_FIELDS);
  });

  it('returns the same user by id, and the non-default fields only via $select', async () => {
    const byUpn = await request(app.server).get(`/v1.0/users/${PIETER_UPN}`).set(bearer);
    const id: string = byUpn.body.id;
    const res = await request(app.server)
      .get(`/v1.0/users/${id}`)
      .query({ $select: 'id,accountEnabled,department,employeeHireDate,usageLocation,assignedLicenses' })
      .set(bearer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      accountEnabled: true,
      department: 'Digitalisering',
      usageLocation: 'NL',
    });
    expect(res.body.employeeHireDate).toBeTruthy();
    expect(res.body.assignedLicenses.length).toBeGreaterThan(0);
    expect(res.body.displayName).toBeUndefined();
  });

  it('answers 404 Request_ResourceNotFound for an unknown user', async () => {
    const res = await request(app.server).get('/v1.0/users/sanne.devries@demo-amsterdam.onmicrosoft.com').set(bearer);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('Request_ResourceNotFound');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('filters users with eq on userPrincipalName and on mail', async () => {
    for (const field of ['userPrincipalName', 'mail']) {
      const res = await request(app.server)
        .get('/v1.0/users')
        .query({ $filter: `${field} eq '${PIETER_UPN}'` })
        .set(bearer);
      expect(res.status).toBe(200);
      expect(res.body.value.map((u: { displayName: string }) => u.displayName)).toEqual(['Pieter Bakker']);
    }
    const none = await request(app.server)
      .get('/v1.0/users')
      .query({ $filter: "userPrincipalName eq 'sanne.devries@demo-amsterdam.onmicrosoft.com'" })
      .set(bearer);
    expect(none.status).toBe(200);
    expect(none.body.value).toEqual([]);
  });

  it('rejects a $filter on an unsupported property with 400', async () => {
    const res = await request(app.server)
      .get('/v1.0/users')
      .query({ $filter: "department eq 'Digitalisering'" })
      .set(bearer);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBeTruthy();
  });

  it('answers 401 without a bearer token', async () => {
    const res = await request(app.server).get(`/v1.0/users/${PIETER_UPN}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('InvalidAuthenticationToken');
  });
});
