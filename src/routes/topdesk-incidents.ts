import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';
import { type Person, matchesFiql, parseFiql, sendPage, topdeskError, unknownFieldError } from './topdesk.js';

/** One progress-trail entry, kept internally for the screen timeline. */
export interface IncidentAction {
  date: string;
  text: string;
  author: string;
}

/** Stored incident shape (seed `topdesk.incidents`). GET responses replace `actions` by an `action` link. */
export interface Incident {
  id: string;
  number: string;
  briefDescription: string;
  request?: string;
  caller: { id?: string; dynamicName?: string; email?: string };
  category?: { name?: string } | null;
  subcategory?: { name?: string } | null;
  operatorGroup?: { id?: string; name?: string } | null;
  processingStatus?: { name?: string } | null;
  closed: boolean;
  externalNumber: string;
  actions: IncidentAction[];
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
}

/** Fields an incident POST may carry. */
const CREATE_FIELDS = [
  'briefDescription', 'request', 'action', 'caller', 'callerLookup', 'category', 'subcategory', 'operatorGroup',
  'processingStatus', 'externalNumber', 'callType', 'entryType', 'impact', 'urgency', 'priority',
];

/** The only FIQL filters the mock supports on the incident list (spec section 4.2). */
const LIST_QUERY_FIELDS = ['closed', 'externalNumber'];

const COUNTER = 'topdesk.incident';
const AUTHOR = 'Ofelia Integratie';

export type CreateIncidentResult = { ok: true; incident: Incident } | { ok: false; status: number; message: string };

/** Registers the incident number counter on `store` (once per store; derives the start from the seed). */
export function defineIncidentCounter(store: Store): void {
  store.defineCounter(COUNTER, (seed) =>
    Math.max(0, ...(seed.topdesk.incidents as Incident[]).map((i) => Number(i.number.split(' ')[2]) || 0)),
  );
}

const incidents = (store: Store) => store.get().topdesk.incidents as Incident[];

/** API view: `actions[]` stays internal, `action` becomes a link (spec section 4.2). */
export function toApiIncident(incident: Incident): Record<string, unknown> {
  const { actions: _actions, ...rest } = incident;
  return { ...rest, action: `/tas/api/incidents/id/${incident.id}/actions` };
}

function resolveCaller(store: Store, body: Record<string, unknown>): Incident['caller'] | string {
  const form = body.caller !== undefined ? body.caller : body.callerLookup;
  const which = body.caller !== undefined ? 'caller' : 'callerLookup';
  if (body.caller !== undefined && body.callerLookup !== undefined) return "Use either 'caller' or 'callerLookup', not both";
  if (form === null || typeof form !== 'object' || Array.isArray(form)) {
    return "The field 'caller' or 'callerLookup' is required";
  }
  const { id, email } = form as { id?: unknown; email?: unknown };
  if ((id === undefined) === (email === undefined)) return `The field '${which}' needs exactly one of 'id' or 'email'`;
  const persons = store.get().topdesk.persons as Person[];
  const person =
    typeof id === 'string'
      ? persons.find((p) => p.id === id)
      : typeof email === 'string'
        ? persons.find((p) => p.email?.toLowerCase() === email.toLowerCase())
        : undefined;
  if (!person) return `No person found for ${which} ${typeof id === 'string' ? `id '${id}'` : `email '${String(email)}'`}`;
  return { id: person.id, dynamicName: person.dynamicName, email: person.email };
}

/**
 * Validates and stores a new incident (same rules as `POST /tas/api/incidents`), emitting a
 * `topdesk/incident/created` change. Reusable by other routes (e.g. the onboarding form).
 */
export function createIncident(store: Store, input: unknown): CreateIncidentResult {
  const invalid = unknownFieldError(input ?? {}, CREATE_FIELDS);
  if (invalid) return { ok: false, status: 400, message: invalid };
  const body = (input ?? {}) as Record<string, unknown>;
  const brief = body.briefDescription;
  if (typeof brief !== 'string' || brief.trim() === '') {
    return { ok: false, status: 400, message: "The field 'briefDescription' is required" };
  }
  if (brief.length > 80) {
    return { ok: false, status: 400, message: "The field 'briefDescription' can not be longer than 80 characters" };
  }
  const caller = resolveCaller(store, body);
  if (typeof caller === 'string') return { ok: false, status: 400, message: caller };

  const now = new Date().toISOString();
  const { callerLookup: _lookup, action, ...fields } = body;
  const incident: Incident = {
    processingStatus: { name: 'Aangemeld' },
    operatorGroup: null,
    ...fields,
    id: randomUUID(),
    number: '',
    briefDescription: brief,
    caller,
    closed: false,
    externalNumber: typeof body.externalNumber === 'string' ? body.externalNumber : '',
    actions: [{ date: now, text: 'Melding geregistreerd', author: AUTHOR }],
    createdAt: now,
    updatedAt: now,
  };
  if (typeof action === 'string' && action.trim() !== '') incident.actions.push({ date: now, text: action, author: AUTHOR });
  store.update('topdesk', (t) => {
    incident.number = `I 2610 ${String(store.next(COUNTER)).padStart(3, '0')}`;
    (t.incidents as Incident[]).push(incident);
    return { entity: 'incident', action: 'created', id: incident.id, summary: `Melding ${incident.number} aangemaakt` };
  });
  return { ok: true, incident };
}

/** Incident routes; called inside `topdeskRoutes` so they share its auth, parser and error handler. */
export function registerIncidentRoutes(app: FastifyInstance, store: Store): void {
  defineIncidentCounter(store);

  app.post('/incidents', async (req, reply) => {
    const result = createIncident(store, req.body);
    if (!result.ok) return topdeskError(reply, result.status, result.message);
    return reply.code(201).send(toApiIncident(result.incident));
  });

  app.get<{ Querystring: { query?: string; pageStart?: string; pageSize?: string } }>('/incidents', async (req, reply) => {
    const terms = parseFiql(req.query.query, LIST_QUERY_FIELDS);
    if (typeof terms === 'string') return topdeskError(reply, 400, terms);
    const found = incidents(store).filter((i) => matchesFiql(i, terms)).map(toApiIncident);
    return sendPage(reply, found, { ...req.query, defaultPageSize: 10, url: req.url });
  });

  type ByKey = { Params: { key: string } };
  const byId = (req: { params: { key: string } }) => incidents(store).find((i) => i.id === req.params.key);
  const byNumber = (req: { params: { key: string } }) => incidents(store).find((i) => i.number === req.params.key);

  for (const [path, find, label] of [
    ['/incidents/id/:key', byId, 'id'],
    ['/incidents/number/:key', byNumber, 'number'],
  ] as const) {
    app.get<ByKey>(path, async (req, reply) => {
      const incident = find(req);
      if (!incident) return topdeskError(reply, 404, `Incident with ${label} '${req.params.key}' not found`);
      return reply.code(200).send(toApiIncident(incident));
    });

    app.patch<ByKey>(path, async (req, reply) => {
      const incident = find(req);
      if (!incident) return topdeskError(reply, 404, `Incident with ${label} '${req.params.key}' not found`);
      const result = updateIncident(store, incident, req.body ?? {});
      if (typeof result === 'string') return topdeskError(reply, 400, result);
      return reply.code(200).send(toApiIncident(incident));
    });
  }
}

const PATCH_FIELDS = ['action', 'processingStatus', 'closed', 'externalNumber', 'operatorGroup'];

const isNamed = (v: unknown): v is { name: string } =>
  v !== null && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string';

/** Applies a PATCH body (spec section 4.2 subset); returns an error message on invalid input. */
function updateIncident(store: Store, incident: Incident, input: unknown): Incident | string {
  const invalid = unknownFieldError(input, PATCH_FIELDS);
  if (invalid) return invalid;
  const body = input as Record<string, unknown>;
  if (body.action !== undefined && typeof body.action !== 'string') return "The field 'action' must be a string";
  if (body.processingStatus !== undefined && !isNamed(body.processingStatus)) return "The field 'processingStatus.name' is required";
  if (body.operatorGroup !== undefined && !isNamed(body.operatorGroup)) return "The field 'operatorGroup.name' is required";
  if (body.closed !== undefined && typeof body.closed !== 'boolean') return "The field 'closed' must be a boolean";
  if (body.externalNumber !== undefined && typeof body.externalNumber !== 'string') return "The field 'externalNumber' must be a string";

  const now = new Date().toISOString();
  store.update('topdesk', (t) => {
    if (typeof body.action === 'string' && body.action.trim() !== '') {
      incident.actions.push({ date: now, text: body.action, author: AUTHOR });
    }
    if (isNamed(body.processingStatus)) incident.processingStatus = { name: body.processingStatus.name };
    if (isNamed(body.operatorGroup)) {
      const name = body.operatorGroup.name;
      const group = (t.operatorGroups as { id: string; name: string }[]).find((g) => g.name.toLowerCase() === name.toLowerCase());
      incident.operatorGroup = group ? { id: group.id, name: group.name } : { name };
    }
    if (typeof body.closed === 'boolean') incident.closed = body.closed;
    if (typeof body.externalNumber === 'string') incident.externalNumber = body.externalNumber;
    incident.updatedAt = now;
    return { entity: 'incident', action: 'updated', id: incident.id, summary: `Melding ${incident.number} bijgewerkt` };
  });
  return incident;
}
