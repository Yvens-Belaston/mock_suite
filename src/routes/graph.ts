import { randomBytes } from 'node:crypto';
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
  };
}

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
