import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const auth = { authorization: 'Bearer test-token' };
const VPN = '5a8e3b9d-0005-4c2f-8e1a-000000000005';
const PIETER = '7d2f0c1a-0001-4b6e-9c3d-000000000001';
const JULIA = '7d2f0c1a-0010-4b6e-9c3d-000000000010';

describe('Graph groups', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('finds a group by displayName filter', async () => {
    const res = await request(app.server)
      .get('/v1.0/groups')
      .query({ $filter: "displayName eq 'GG-VPN-Gebruikers'" })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.value).toHaveLength(1);
    expect(res.body.value[0]).toMatchObject({ id: VPN, displayName: 'GG-VPN-Gebruikers' });
    expect(res.body.value[0].memberIds).toBeUndefined();
  });

  const memberOf = async (x: string) => {
    const res = await request(app.server).get(`/v1.0/users/${x}/memberOf`).set(auth);
    expect(res.status).toBe(200);
    return res.body.value as { '@odata.type': string; id: string; displayName: string }[];
  };

  it('lists the groups a user is a member of, by id or UPN', async () => {
    const byId = await memberOf(JULIA);
    expect(byId).toEqual([
      { '@odata.type': '#microsoft.graph.group', id: '5a8e3b9d-0002-4c2f-8e1a-000000000002', displayName: 'GG-Sociaal-Domein' },
      { '@odata.type': '#microsoft.graph.group', id: '5a8e3b9d-0004-4c2f-8e1a-000000000004', displayName: 'GG-Alle-Medewerkers' },
    ]);
    const user = await request(app.server).get(`/v1.0/users/${JULIA}`).set(auth);
    expect(await memberOf(user.body.userPrincipalName)).toEqual(byId);
  });

  const addMember = (gid: string, body: unknown) =>
    request(app.server).post(`/v1.0/groups/${gid}/members/$ref`).set(auth).send(body as object);
  const ref = (uid: string) => ({ '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${uid}` });

  it('adds a member (204), rejects a second add (400) and memberOf reflects it', async () => {
    expect((await memberOf(JULIA)).map((g) => g.displayName)).not.toContain('GG-VPN-Gebruikers');

    const first = await addMember(VPN, ref(JULIA));
    expect(first.status).toBe(204);
    expect(first.text).toBe('');
    expect((await memberOf(JULIA)).map((g) => g.displayName)).toContain('GG-VPN-Gebruikers');

    const again = await addMember(VPN, ref(JULIA));
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('Request_BadRequest');
    expect(again.body.error.message).toContain('already exist');
  });

  it('records a group change event when a member is added', async () => {
    await addMember(VPN, ref(JULIA));
    const state = await request(app.server).get('/admin/state');
    expect(state.body.events.at(-1)).toMatchObject({
      system: 'graph',
      entity: 'group',
      action: 'updated',
      id: VPN,
      summary: 'Julia Peters toegevoegd aan GG-VPN-Gebruikers',
    });
  });

  it('answers 404 when adding to an unknown group or an unknown user', async () => {
    const noGroup = await addMember('00000000-0000-4000-8000-000000000000', ref(JULIA));
    expect(noGroup.status).toBe(404);
    expect(noGroup.body.error.code).toBe('Request_ResourceNotFound');
    const noUser = await addMember(VPN, ref('00000000-0000-4000-8000-000000000000'));
    expect(noUser.status).toBe(404);
    expect(noUser.body.error.code).toBe('Request_ResourceNotFound');
  });

  it('answers 400 when @odata.id is missing', async () => {
    const res = await addMember(VPN, {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('Request_BadRequest');
  });

  const removeMember = (gid: string, uid: string) =>
    request(app.server).delete(`/v1.0/groups/${gid}/members/${uid}/$ref`).set(auth);

  it('removes a member (204), memberOf reflects it, and a second remove is 404', async () => {
    const res = await removeMember(VPN, PIETER);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await memberOf(PIETER)).map((g) => g.displayName)).toEqual(['GG-Digitalisering', 'GG-Alle-Medewerkers']);

    const again = await removeMember(VPN, PIETER);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('Request_ResourceNotFound');

    const state = await request(app.server).get('/admin/state');
    expect(state.body.events.at(-1)).toMatchObject({
      system: 'graph',
      entity: 'group',
      action: 'updated',
      id: VPN,
      summary: 'Pieter Bakker verwijderd uit GG-VPN-Gebruikers',
    });
  });

  it('answers 404 when removing from an unknown group', async () => {
    const res = await removeMember('00000000-0000-4000-8000-000000000000', PIETER);
    expect(res.status).toBe(404);
  });

  it('requires a bearer token on group routes', async () => {
    const res = await request(app.server).get('/v1.0/groups');
    expect(res.status).toBe(401);
  });

  it('answers 404 for memberOf of an unknown user', async () => {
    const res = await request(app.server).get('/v1.0/users/nobody@example.com/memberOf').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('Request_ResourceNotFound');
  });
});
