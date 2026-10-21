import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';

type Form = Record<string, string | undefined>;

/** Entra's flat token error shape (not Graph's `{ error: { code, message } }`). */
function tokenError(description: string) {
  return { error: 'invalid_request', error_description: description };
}

/** `Authorization: Basic base64(client_id:client_secret)` → its parts, if present. */
function basicCredentials(header: string | undefined): { id?: string; secret?: string } {
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match) return {};
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return {};
  return { id: decodeURIComponent(decoded.slice(0, sep)), secret: decodeURIComponent(decoded.slice(sep + 1)) };
}

/** Microsoft Graph (`/v1.0`) and the Entra token endpoint (spec sections 4.1, 4.3). */
export function graphRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    /** The tenant Bonita is expected to use (spec section 7); any tenant is still accepted, only logged. */
    const tenantId = process.env.TENANT_ID || 'demo-amsterdam';

    // Encapsulated: only routes in this plugin parse form bodies.
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });

    app.post<{ Params: { tenant: string }; Body: Form | undefined }>(
      '/:tenant/oauth2/v2.0/token',
      async (req, reply) => {
        const form = req.body && typeof req.body === 'object' ? req.body : {};
        const basic = basicCredentials(req.headers.authorization);
        const fields: Form = {
          grant_type: form.grant_type,
          client_id: form.client_id ?? basic.id,
          client_secret: form.client_secret ?? basic.secret,
          scope: form.scope,
        };
        const missing = Object.keys(fields).find((k) => !fields[k]);
        if (missing) {
          return reply.code(400).send(tokenError(`The request body must contain the following parameter: '${missing}'.`));
        }
        const match = req.params.tenant === tenantId ? 'matches TENANT_ID' : `TENANT_ID is ${tenantId}`;
        process.stdout.write(`token tenant ${req.params.tenant} (${match})\n`);
        return { token_type: 'Bearer', expires_in: 3599, access_token: `mock-${randomBytes(16).toString('hex')}` };
      },
    );
    // Every `/v1.0` route in this plugin needs `Authorization: Bearer <anything>` (spec 4.1).
    app.addHook('onRequest', async (req, reply) => {
      if (!req.url.startsWith('/v1.0/')) return;
      if (/^Bearer\s+\S+/i.test(req.headers.authorization ?? '')) return;
      return reply
        .code(401)
        .send(graphError('InvalidAuthenticationToken', 'Access token is empty.'));
    });

    app.get<{ Querystring: { $filter?: string; $select?: string } }>('/v1.0/users', async (req, reply) => {
      let list = users(store);
      if (req.query.$filter !== undefined) {
        const filter = parseEqFilter(req.query.$filter, ['userPrincipalName', 'mail']);
        if (!filter) {
          return reply
            .code(400)
            .send(graphError('Request_UnsupportedQuery', `Unsupported or invalid query filter clause: ${req.query.$filter}`));
        }
        const wanted = filter.value.toLowerCase();
        list = list.filter((u) => String(u[filter.property as 'mail'] ?? '').toLowerCase() === wanted);
      }
      return { '@odata.context': `${ODATA}#users`, value: list.map((u) => project(u, req.query.$select)) };
    });

    app.get<{ Params: { x: string }; Querystring: { $select?: string } }>('/v1.0/users/:x', async (req, reply) => {
      const user = findUser(store, req.params.x);
      if (!user) return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(req.params.x)));
      return { '@odata.context': `${ODATA}#users/$entity`, ...project(user, req.query.$select) };
    });

    // Ticket 09: user writes (POST/PATCH user, manager $ref, assignLicense, revokeSignInSessions).
    userWriteRoutes(app, store);

    groupRoutes(app, store);
  };
}

// ---- Groups and memberships (ticket 10) -------------------------------------------------------

/** A group as stored in `state.graph.groups` (spec section 3). */
export interface GraphGroup {
  id: string;
  displayName: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

function groups(store: Store): GraphGroup[] {
  return store.get().graph.groups as GraphGroup[];
}

/** The group as Graph returns it (no internal fields). */
function projectGroup(group: GraphGroup) {
  return { id: group.id, displayName: group.displayName };
}

/** Group routes; registered from `graphRoutes`, so they inherit its bearer guard and body parser. */
function groupRoutes(app: FastifyInstance, store: Store): void {
  app.get<{ Querystring: { $filter?: string } }>('/v1.0/groups', async (req, reply) => {
    let list = groups(store);
    if (req.query.$filter !== undefined) {
      const filter = parseEqFilter(req.query.$filter, ['displayName']);
      if (!filter) {
        return reply
          .code(400)
          .send(graphError('Request_UnsupportedQuery', `Unsupported or invalid query filter clause: ${req.query.$filter}`));
      }
      list = list.filter((g) => g.displayName.toLowerCase() === filter.value.toLowerCase());
    }
    return { '@odata.context': `${ODATA}#groups`, value: list.map(projectGroup) };
  });

  app.get<{ Params: { x: string } }>('/v1.0/users/:x/memberOf', async (req, reply) => {
    const user = findUser(store, req.params.x);
    if (!user) return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(req.params.x)));
    const value = groups(store)
      .filter((g) => g.memberIds.includes(user.id))
      .map((g) => ({ '@odata.type': '#microsoft.graph.group', ...projectGroup(g) }));
    return { '@odata.context': `${ODATA}#directoryObjects`, value };
  });

  app.post<{ Params: { gid: string }; Body: Record<string, unknown> | undefined }>(
    '/v1.0/groups/:gid/members/$ref',
    async (req, reply) => {
      const odataId = req.body?.['@odata.id'];
      if (typeof odataId !== 'string' || !odataId.trim()) {
        return reply.code(400).send(graphError('Request_BadRequest', "The request body must contain '@odata.id'."));
      }
      const group = findGroup(store, req.params.gid);
      if (!group) return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(req.params.gid)));
      const uid = odataId.replace(/\/+$/, '').split('/').pop() ?? '';
      const user = users(store).find((u) => u.id === uid);
      if (!user) return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(uid)));
      if (group.memberIds.includes(user.id)) {
        return reply
          .code(400)
          .send(
            graphError(
              'Request_BadRequest',
              "One or more added object references already exist for the following modified properties: 'members'.",
            ),
          );
      }
      store.update('graph', () => {
        group.memberIds.push(user.id);
        group.updatedAt = new Date().toISOString();
        return {
          entity: 'group',
          action: 'updated',
          id: group.id,
          summary: `${user.displayName} toegevoegd aan ${group.displayName}`,
        };
      });
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { gid: string; uid: string } }>('/v1.0/groups/:gid/members/:uid/$ref', async (req, reply) => {
    const { gid, uid } = req.params;
    const group = findGroup(store, gid);
    if (!group) return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(gid)));
    if (!group.memberIds.includes(uid)) {
      return reply.code(404).send(graphError('Request_ResourceNotFound', notFoundMessage(uid)));
    }
    const name = users(store).find((u) => u.id === uid)?.displayName ?? uid;
    store.update('graph', () => {
      group.memberIds = group.memberIds.filter((m) => m !== uid);
      group.updatedAt = new Date().toISOString();
      return { entity: 'group', action: 'updated', id: group.id, summary: `${name} verwijderd uit ${group.displayName}` };
    });
    return reply.code(204).send();
  });
}

function findGroup(store: Store, gid: string): GraphGroup | undefined {
  return groups(store).find((g) => g.id === gid);
}

// ---- end groups (ticket 10) -------------------------------------------------------------------

const ODATA = 'https://graph.microsoft.com/v1.0/$metadata';

/** A user as stored in `state.graph.users` (spec section 3). */
export interface GraphUser {
  id: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  mailNickname: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  businessPhones: string[];
  mobilePhone: string | null;
  preferredLanguage: string | null;
  employeeHireDate: string | null;
  usageLocation: string | null;
  accountEnabled: boolean;
  managerId: string | null;
  assignedLicenses: { skuId: string }[];
  signInSessionsRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields Graph returns for a user when no `$select` is given. */
export const DEFAULT_USER_FIELDS = [
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
] as const;

/** Internal fields that are never part of a Graph response. */
const INTERNAL_FIELDS = new Set(['managerId', 'signInSessionsRevokedAt', 'createdAt', 'updatedAt']);

/** Graph error shape `{ error: { code, message } }`. */
export function graphError(code: string, message: string) {
  return { error: { code, message } };
}

function notFoundMessage(x: string): string {
  return `Resource '${x}' does not exist or one of its queried reference-property objects are not present.`;
}

/** `{x}` in `/v1.0/users/{x}` is the user `id` or `userPrincipalName` (UPN case-insensitive, like Graph). */
export function findUser(store: Store, x: string): GraphUser | undefined {
  const key = x.toLowerCase();
  return users(store).find((u) => u.id === x || u.userPrincipalName.toLowerCase() === key);
}

/**
 * Parse an OData `$filter` of the form `<property> eq '<value>'` (`''` escapes a quote).
 * Returns null for anything else or a property outside `allowed`.
 */
export function parseEqFilter(filter: string, allowed: readonly string[]): { property: string; value: string } | null {
  const match = filter.trim().match(/^(\w+)\s+eq\s+'((?:[^']|'')*)'$/i);
  if (!match || !allowed.includes(match[1])) return null;
  return { property: match[1], value: match[2].replace(/''/g, "'") };
}

function users(store: Store): GraphUser[] {
  return store.get().graph.users as GraphUser[];
}

/** The user as Graph returns it: default field set, or exactly the `$select` fields (comma-separated). */
export function project(user: GraphUser, select?: string): Record<string, unknown> {
  const fields = select
    ? select.split(',').map((f) => f.trim()).filter((f) => f && !INTERNAL_FIELDS.has(f))
    : [...DEFAULT_USER_FIELDS];
  const record = user as unknown as Record<string, unknown>;
  return Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));
}

// ---------------------------------------------------------------------------
// Ticket 09: user writes (spec 4.3). Registered inside `graphRoutes`, so the bearer guard applies.
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

const REQUIRED_CREATE_FIELDS = ['accountEnabled', 'displayName', 'mailNickname', 'userPrincipalName'] as const;

/** Fields a client may set on create or PATCH (everything else in the body is ignored). */
const WRITABLE_USER_FIELDS = [
  'accountEnabled',
  'displayName',
  'givenName',
  'surname',
  'mailNickname',
  'userPrincipalName',
  'mail',
  'jobTitle',
  'department',
  'officeLocation',
  'businessPhones',
  'mobilePhone',
  'preferredLanguage',
  'employeeHireDate',
  'usageLocation',
] as const;

function asBody(body: unknown): Body {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : {};
}

function badRequest(message: string) {
  return graphError('Request_BadRequest', message);
}

function writableFields(body: Body): Partial<GraphUser> {
  return Object.fromEntries(WRITABLE_USER_FIELDS.filter((f) => f in body).map((f) => [f, body[f]])) as Partial<GraphUser>;
}

function upnTaken(store: Store, upn: string, exceptId?: string): boolean {
  const key = upn.toLowerCase();
  return users(store).some((u) => u.id !== exceptId && u.userPrincipalName.toLowerCase() === key);
}

const DUPLICATE_UPN = 'Another object with the same value for property userPrincipalName already exists.';

function userWriteRoutes(app: FastifyInstance, store: Store): void {
  app.post('/v1.0/users', async (req, reply) => {
    const body = asBody(req.body);
    const missing = REQUIRED_CREATE_FIELDS.find((f) => body[f] === undefined || body[f] === null || body[f] === '');
    if (missing) return reply.code(400).send(badRequest(`Property '${missing}' is required.`));
    const password = asBody(body.passwordProfile).password;
    if (typeof password !== 'string' || !password) {
      return reply.code(400).send(badRequest("Property 'passwordProfile.password' is required."));
    }
    const upn = String(body.userPrincipalName);
    if (upnTaken(store, upn)) return reply.code(400).send(badRequest(DUPLICATE_UPN));
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      givenName: null,
      surname: null,
      mail: upn,
      jobTitle: null,
      department: null,
      officeLocation: null,
      businessPhones: [],
      mobilePhone: null,
      preferredLanguage: null,
      employeeHireDate: null,
      usageLocation: null,
      ...writableFields(body),
      managerId: null,
      assignedLicenses: [],
      signInSessionsRevokedAt: null,
      createdAt: now,
      updatedAt: now,
    } as GraphUser;
    store.update('graph', (g) => {
      (g.users as GraphUser[]).push(user);
      return { entity: 'user', action: 'created', id: user.id, summary: `${user.displayName} aangemaakt` };
    });
    return reply.code(201).send({ '@odata.context': `${ODATA}#users/$entity`, ...project(user) });
  });

  app.patch<{ Params: { x: string } }>('/v1.0/users/:x', async (req, reply) => {
    const user = findUser(store, req.params.x);
    if (!user) return reply.code(404).send(notFound(req.params.x));
    if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      return reply.code(400).send(badRequest('The request body must be a JSON object.'));
    }
    const changes = writableFields(asBody(req.body));
    // Nothing we know how to update: accept it unchanged, like Graph (spec 4: never require more).
    if (Object.keys(changes).length === 0) return reply.code(204).send();
    if (changes.userPrincipalName !== undefined && upnTaken(store, String(changes.userPrincipalName), user.id)) {
      return reply.code(400).send(badRequest(DUPLICATE_UPN));
    }
    updateUser(store, user, changes, `${user.displayName} bijgewerkt`);
    return reply.code(204).send();
  });

  // Documented with `{id}` only: the UPN is not accepted here (spec 4.3).
  app.put<{ Params: { id: string } }>('/v1.0/users/:id/manager/$ref', async (req, reply) => {
    const user = users(store).find((u) => u.id === req.params.id);
    if (!user) return reply.code(404).send(notFound(req.params.id));
    const ref = asBody(req.body)['@odata.id'];
    if (typeof ref !== 'string' || !ref) return reply.code(400).send(badRequest("Property '@odata.id' is required."));
    const managerId = ref.split('/').pop() ?? '';
    const manager = users(store).find((u) => u.id === managerId);
    if (!manager) return reply.code(404).send(notFound(managerId));
    updateUser(store, user, { managerId: manager.id }, `${manager.displayName} is manager van ${user.displayName}`);
    return reply.code(204).send();
  });

  app.post<{ Params: { x: string } }>('/v1.0/users/:x/assignLicense', async (req, reply) => {
    const user = findUser(store, req.params.x);
    if (!user) return reply.code(404).send(notFound(req.params.x));
    const body = asBody(req.body);
    for (const field of ['addLicenses', 'removeLicenses']) {
      if (!Array.isArray(body[field])) return reply.code(400).send(badRequest(`Property '${field}' is required.`));
    }
    const add = (body.addLicenses as unknown[]).map((l) => String(asBody(l).skuId ?? ''));
    const remove = (body.removeLicenses as unknown[]).map(String);
    if (add.length > 0 && !user.usageLocation) {
      return reply
        .code(400)
        .send(badRequest(`License assignment cannot be done for user ${user.id} with invalid usage location.`));
    }
    const skus = store.get().graph.skus as { skuId: string; skuPartNumber: string }[];
    const unknown = [...add, ...remove].find((id) => !skus.some((s) => s.skuId === id));
    if (unknown !== undefined) {
      return reply.code(400).send(badRequest(`License ${unknown} does not correspond to a valid company License.`));
    }
    const kept = user.assignedLicenses.filter((l) => !remove.includes(l.skuId) && !add.includes(l.skuId));
    const names = (ids: string[]) => ids.map((id) => skus.find((s) => s.skuId === id)?.skuPartNumber).join(', ');
    const summary = add.length
      ? `Licentie ${names(add)} toegekend aan ${user.displayName}`
      : remove.length
        ? `Licentie ${names(remove)} ingetrokken bij ${user.displayName}`
        : `Licenties van ${user.displayName} bijgewerkt`;
    updateUser(store, user, { assignedLicenses: [...kept, ...add.map((skuId) => ({ skuId }))] }, summary);
    return { '@odata.context': `${ODATA}#users/$entity`, ...project(user) };
  });

  app.post<{ Params: { x: string } }>('/v1.0/users/:x/revokeSignInSessions', async (req, reply) => {
    const user = findUser(store, req.params.x);
    if (!user) return reply.code(404).send(notFound(req.params.x));
    updateUser(store, user, { signInSessionsRevokedAt: new Date().toISOString() }, `Sessies van ${user.displayName} ingetrokken`);
    return { '@odata.context': `${ODATA}#Edm.Boolean`, value: true };
  });
}

function notFound(x: string) {
  return graphError('Request_ResourceNotFound', notFoundMessage(x));
}

/** Mutate the stored user through `store.update` (emits a `graph/user/updated` change). */
function updateUser(store: Store, user: GraphUser, changes: Partial<GraphUser>, summary: string): void {
  store.update('graph', () => {
    Object.assign(user, changes, { updatedAt: new Date().toISOString() });
    return { entity: 'user', action: 'updated', id: user.id, summary };
  });
}
