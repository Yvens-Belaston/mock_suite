import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Store } from '../store.js';
import { registerChangeRoutes } from './topdesk-changes.js';
import { registerIncidentRoutes } from './topdesk-incidents.js';

export interface Person {
  id: string;
  firstName?: string;
  surName: string;
  dynamicName: string;
  email?: string;
  networkLoginName?: string;
  department?: { id?: string; name?: string } | null;
  branch?: { id?: string; name?: string } | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
}

/** TOPdesk error style: a JSON array of `{ message }`. */
export function topdeskError(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.code(status).send([{ message }]);
}

/** One `field==value` term of a FIQL query; terms joined with `;` must all match. */
export interface FiqlTerm {
  field: string;
  value: string;
}

/**
 * Parses the `field==value;field==value` subset of FIQL (AND only). Returns an error message for
 * other syntax or for a field not in `fields`.
 */
export function parseFiql(query: string | undefined, fields: readonly string[]): FiqlTerm[] | string {
  if (query === undefined || query.trim() === '') return [];
  const terms: FiqlTerm[] = [];
  for (const part of query.split(';')) {
    const m = /^\s*([A-Za-z][\w.]*)\s*==\s*(.*?)\s*$/.exec(part);
    if (!m) return `Invalid query: '${part}'`;
    if (!fields.includes(m[1])) return `The field '${m[1]}' does not exist or can not be used in a query`;
    terms.push({ field: m[1], value: m[2].replace(/^(['"])(.*)\1$/, '$2') });
  }
  return terms;
}

/** Strings compare case-insensitively; booleans and numbers by their text form. */
export function matchesFiql(record: Record<string, unknown>, terms: readonly FiqlTerm[]): boolean {
  return terms.every(({ field, value }) => {
    const actual = field.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | null)?.[k], record);
    if (actual === undefined || actual === null) return value === 'null';
    return String(actual).toLowerCase() === value.toLowerCase();
  });
}

/**
 * Sends one page the TOPdesk way: `204` without body when `items` is empty, `206` (plus an
 * `x-next-page-url` header) when more items follow this page, else `200`.
 */
export function sendPage<T>(
  reply: FastifyReply,
  items: readonly T[],
  opts: { pageStart?: string; pageSize?: string; defaultPageSize: number; url: string },
): FastifyReply {
  const start = Math.max(0, Number.parseInt(opts.pageStart ?? '', 10) || 0);
  const size = Math.max(1, Number.parseInt(opts.pageSize ?? '', 10) || opts.defaultPageSize);
  const page = items.slice(start, start + size);
  if (page.length === 0) return reply.code(204).send();
  if (start + size < items.length) {
    const next = new URL(opts.url, 'http://mock');
    next.searchParams.set('pageStart', String(start + size));
    next.searchParams.set('pageSize', String(size));
    reply.header('x-next-page-url', `${next.pathname}${next.search}`);
    return reply.code(206).send(page);
  }
  return reply.code(200).send(page);
}

/**
 * Checks a JSON body is an object whose top-level fields are all in `allowed`; returns the
 * TOPdesk-style error message otherwise (TOPdesk rejects unknown fields, spec section 4).
 */
export function unknownFieldError(body: unknown, allowed: readonly string[]): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'The request body must be a JSON object';
  const unknown = Object.keys(body).find((k) => !allowed.includes(k));
  return unknown === undefined ? undefined : `The field '${unknown}' does not exist`;
}

/** TOPdesk person fields a create may set (the subset of the real v2 schema the demo can use). */
const PERSON_FIELDS = [
  'firstName', 'surName', 'prefixes', 'firstInitials', 'gender', 'email', 'networkLoginName', 'tasLoginName',
  'employeeNumber', 'jobTitle', 'phoneNumber', 'mobileNumber', 'department', 'branch', 'location', 'budgetHolder',
  'manager', 'isManager',
];

const PERSON_QUERY_FIELDS =['id', 'email', 'firstName', 'surName', 'dynamicName', 'networkLoginName', 'archived'];

/** TOPdesk API under `/tas/api` (spec section 4.2). Every route needs `Authorization: Basic …` (any value). */
export function topdeskRoutes(store: Store) {
  const persons = () => store.get().topdesk.persons as Person[];

  return async function (app: FastifyInstance): Promise<void> {
    app.addHook('onRequest', async (req, reply) => {
      if (!/^Basic\s+\S/i.test(req.headers.authorization ?? '')) {
        reply.header('www-authenticate', 'Basic realm="TOPdesk"');
        return topdeskError(reply, 401, 'Authentication required');
      }
    });

    // An empty JSON body reads as "no body" (e.g. archive without a reason), as TOPdesk allows.
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      const text = String(body);
      if (text.trim() === '') return done(null, undefined);
      try {
        done(null, JSON.parse(text));
      } catch {
        done(Object.assign(new Error('The request body is not valid JSON'), { statusCode: 400 }));
      }
    });

    // Framework errors (bad JSON, too large body, ...) in TOPdesk's `[{ message }]` shape.
    app.setErrorHandler((err, _req, reply) => {
      const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
      return topdeskError(reply, status, status === 500 ? 'Internal server error' : err.message);
    });

    app.get('/version',async () => ({ version: '3.x-mock' }));

    // --- Operator changes (ticket 15): routes live in ./topdesk-changes.ts ---
    registerChangeRoutes(app, store);
    // --- end operator changes ---
    // --- Incidents (ticket 14): routes live in ./topdesk-incidents.ts ---
    registerIncidentRoutes(app, store);
    // --- end incidents ---

    app.get<{ Querystring: { query?: string; pageStart?: string; pageSize?: string } }>(
      '/persons',
      async (req, reply) => {
        const terms = parseFiql(req.query.query, PERSON_QUERY_FIELDS);
        if (typeof terms === 'string') return topdeskError(reply, 400, terms);
        const found = persons().filter((p) => matchesFiql(p, terms));
        return sendPage(reply, found, { ...req.query, defaultPageSize: 50, url: req.url });
      },
    );

    app.post('/persons', async (req, reply) => {
      const invalid = unknownFieldError(req.body ?? {}, PERSON_FIELDS);
      if (invalid) return topdeskError(reply, 400, invalid);
      const body = (req.body ?? {}) as Partial<Person>;
      if (typeof body.surName !== 'string' || body.surName.trim() === '') {
        return topdeskError(reply, 400, "The field 'surName' is required");
      }
      const now = new Date().toISOString();
      const person: Person = {
        id: randomUUID(),
        ...body,
        surName: body.surName,
        dynamicName: [body.firstName, body.prefixes, body.surName].filter((s) => typeof s === 'string' && s).join(' '),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      store.update('topdesk', (t) => {
        (t.persons as Person[]).push(person);
        return { entity: 'person', action: 'created', id: person.id, summary: `Persoon ${person.dynamicName} aangemaakt` };
      });
      return reply.code(201).send(person);
    });

    app.patch<{ Params: { id: string } }>('/persons/id/:id/archive', async (req, reply) => {
      const invalid = unknownFieldError(req.body ?? {}, ['id']);
      if (invalid) return topdeskError(reply, 400, invalid);
      const reasonId = (req.body as { id?: unknown } | undefined)?.id;
      const person = persons().find((p) => p.id === req.params.id);
      if (!person) return topdeskError(reply, 404, `Person with id '${req.params.id}' not found`);
      if (person.archived) return topdeskError(reply, 400, 'The person is already archived');
      store.update('topdesk', () => {
        person.archived = true;
        if (typeof reasonId === 'string') person.archivingReason = { id: reasonId };
        person.updatedAt = new Date().toISOString();
        return { entity: 'person', action: 'updated', id: person.id, summary: `Persoon ${person.dynamicName} gearchiveerd` };
      });
      return reply.code(200).send(person);
    });
  };
}
