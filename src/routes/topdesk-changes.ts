import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store.js';
import { topdeskError, unknownFieldError, type Person } from './topdesk.js';

/** Progress trail entry, kept internally for the screen. */
export interface ProgressEntry {
  date: string;
  text: string;
}

export interface Change {
  id: string;
  number: string;
  briefDescription: string;
  request?: string;
  changeType: string;
  template?: { id?: string; number?: string } | null;
  requester: { id?: string; name: string };
  processingStatus: string;
  externalNumber: string;
  progressTrail: ProgressEntry[];
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
}

/** TOPdesk change fields a create may set (subset of the real operatorChanges schema). */
const CHANGE_FIELDS = ['requester', 'briefDescription', 'request', 'changeType', 'template', 'externalNumber', 'category', 'subcategory'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operator change routes (spec section 4.2), registered inside the TOPdesk plugin so they share
 * its auth hook, JSON parser and error handler.
 */
export function registerChangeRoutes(app: FastifyInstance, store: Store): void {
  const changes = () => store.get().topdesk.changes as Change[];
  const persons = () => store.get().topdesk.persons as Person[];

  store.defineCounter('topdesk.change', (seed) =>
    Math.max(0, ...(seed.topdesk.changes as Change[]).map((c) => Number(c.number.split(' ')[2]))));

  /** Resolves the `requester` form to `{ id?, name }`, or returns an error message. */
  function resolveRequester(input: unknown): Change['requester'] | string {
    const r = (input ?? {}) as { id?: unknown; identifier?: unknown; name?: unknown };
    if (typeof input !== 'object' || input === null) return "The field 'requester' is required";
    if (typeof r.id === 'string' && r.id) {
      const p = persons().find((x) => x.id === r.id);
      return p ? { id: p.id, name: p.dynamicName } : `Person with id '${r.id}' not found`;
    }
    if (typeof r.identifier === 'string' && r.identifier) {
      const key = r.identifier.toLowerCase();
      const p = persons().find((x) =>
        UUID.test(key) ? x.id === key : x.email?.toLowerCase() === key || x.dynamicName.toLowerCase() === key);
      return p ? { id: p.id, name: p.dynamicName } : `No person found for identifier '${r.identifier}'`;
    }
    if (typeof r.name === 'string' && r.name.trim()) {
      const p = persons().find((x) => x.dynamicName.toLowerCase() === (r.name as string).toLowerCase());
      return p ? { id: p.id, name: p.dynamicName } : { name: r.name };
    }
    return "The field 'requester' needs one of 'id', 'identifier' or 'name'";
  }

  app.post('/operatorChanges', async (req, reply) => {
    const invalid = unknownFieldError(req.body ?? {}, CHANGE_FIELDS);
    if (invalid) return topdeskError(reply, 400, invalid);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requester = resolveRequester(body.requester);
    if (typeof requester === 'string') return topdeskError(reply, 400, requester);
    const hasTemplate = typeof body.template === 'object' && body.template !== null;
    for (const field of ['briefDescription', 'changeType'] as const) {
      if (!hasTemplate && (typeof body[field] !== 'string' || (body[field] as string).trim() === '')) {
        return topdeskError(reply, 400, `The field '${field}' is required when no template is given`);
      }
    }
    const now = new Date().toISOString();
    const n = store.next('topdesk.change');
    const change: Change = {
      ...body,
      id: randomUUID(),
      number: `C 2610 ${String(n).padStart(3, '0')}`,
      briefDescription: typeof body.briefDescription === 'string' ? body.briefDescription : '',
      changeType: typeof body.changeType === 'string' ? body.changeType : 'simple',
      requester,
      processingStatus: 'simple_notStarted',
      externalNumber: typeof body.externalNumber === 'string' ? body.externalNumber : '',
      progressTrail: [{ date: now, text: 'Change aangemaakt' }],
      createdAt: now,
      updatedAt: now,
    };
    store.update('topdesk', (t) => {
      (t.changes as Change[]).push(change);
      return { entity: 'change', action: 'created', id: change.id, summary: `Change ${change.number} aangemaakt` };
    });
    return reply.code(201).send(toApi(change));
  });

  app.get<{ Params: { id: string } }>('/operatorChanges/:id', async (req, reply) => {
    const change = changes().find((c) => c.id === req.params.id);
    if (!change) return topdeskError(reply, 404, `Change with id '${req.params.id}' not found`);
    return toApi(change);
  });

  app.post<{ Params: { id: string } }>('/operatorChanges/:id/processingStatusTransitions', async (req, reply) => {
    const change = changes().find((c) => c.id === req.params.id);
    if (!change) return topdeskError(reply, 404, `Change with id '${req.params.id}' not found`);
    const invalid = unknownFieldError(req.body ?? {}, ['from', 'action']);
    if (invalid) return topdeskError(reply, 400, invalid);
    const { from, action } = (req.body ?? {}) as { from?: unknown; action?: unknown };
    const step = typeof action === 'string' && Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action] : undefined;
    if (!step) return topdeskError(reply, 400, `Unknown action '${String(action)}'`);
    if (from !== change.processingStatus) {
      return topdeskError(reply, 400, `The change is in status '${change.processingStatus}', not '${String(from)}'`);
    }
    if (step.from !== change.processingStatus) {
      return topdeskError(reply, 400, `Action '${action}' is not allowed from status '${change.processingStatus}'`);
    }
    store.update('topdesk', () => {
      const now = new Date().toISOString();
      change.processingStatus = step.to;
      change.progressTrail.push({ date: now, text: step.text });
      change.updatedAt = now;
      return { entity: 'change', action: 'updated', id: change.id, summary: `Change ${change.number} ${step.text.toLowerCase()}` };
    });
    return reply.code(201).send(toApi(change));
  });

  // JSON Patch bodies (PATCH below); parsed like the plugin's JSON parser, errors in TOPdesk shape.
  app.addContentTypeParser('application/json-patch+json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(String(body)));
    } catch {
      done(Object.assign(new Error('The request body is not valid JSON'), { statusCode: 400 }));
    }
  });

  app.patch<{ Params: { id: string } }>('/operatorChanges/:id', async (req, reply) => {
    const change = changes().find((c) => c.id === req.params.id);
    if (!change) return topdeskError(reply, 404, `Change with id '${req.params.id}' not found`);
    if (!/^application\/json-patch\+json\b/i.test(req.headers['content-type'] ?? '')) {
      return topdeskError(reply, 415, "Use Content-Type 'application/json-patch+json'");
    }
    const ops = req.body;
    if (!Array.isArray(ops) || ops.length === 0) return topdeskError(reply, 400, 'The request body must be a JSON Patch list');
    for (const op of ops as { op?: unknown; path?: unknown; value?: unknown }[]) {
      if (op?.op !== 'add' || op.path !== '/progressTrail') {
        return topdeskError(reply, 400, `Unsupported patch operation '${String(op?.op)} ${String(op?.path)}'; only 'add /progressTrail' is allowed`);
      }
      if (typeof op.value !== 'string' || op.value.trim() === '') {
        return topdeskError(reply, 400, "The value for '/progressTrail' must be a non-empty text");
      }
    }
    addToTrail(change, ops.map((op: { value: string }) => op.value));
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/operatorChanges/:id/progresstrail', async (req, reply) => {
    const change = changes().find((c) => c.id === req.params.id);
    if (!change) return topdeskError(reply, 404, `Change with id '${req.params.id}' not found`);
    const invalid = unknownFieldError(req.body ?? {}, ['memoText', 'type', 'textFormatting']);
    if (invalid) return topdeskError(reply, 400, invalid);
    const { memoText, type, textFormatting } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof memoText !== 'string' || memoText.trim() === '') return topdeskError(reply, 400, "The field 'memoText' is required");
    if (type !== 'memo') return topdeskError(reply, 400, "The field 'type' is required and must be 'memo'");
    if (textFormatting !== undefined && textFormatting !== 'plain' && textFormatting !== 'html') {
      return topdeskError(reply, 400, "The field 'textFormatting' must be 'plain' or 'html'");
    }
    const [entry] = addToTrail(change, [memoText]);
    return reply.code(201).send({ id: randomUUID(), memoText, type, creationDate: entry.date });
  });

  function addToTrail(change: Change, texts: string[]): ProgressEntry[] {
    const now = new Date().toISOString();
    const entries = texts.map((text) => ({ date: now, text }));
    store.update('topdesk', () => {
      change.progressTrail.push(...entries);
      change.updatedAt = now;
      return { entity: 'change', action: 'updated', id: change.id, summary: `Change ${change.number}: voortgang toegevoegd` };
    });
    return entries;
  }
}

/** The documented simple-change status flow; the text goes on the progress trail and in the event summary. */
const TRANSITIONS: Record<string, { from: string; to: string; text: string }> = {
  start: { from: 'simple_notStarted', to: 'simple_inProgress', text: 'Gestart' },
  implement: { from: 'simple_inProgress', to: 'simple_done', text: 'Uitgevoerd' },
  close: { from: 'simple_done', to: 'simple_closed', text: 'Afgesloten' },
};

/** API view of a change: the progress trail stays internal (it is read on the screen, not via GET). */
function toApi(change: Change): Omit<Change, 'progressTrail'> {
  const { progressTrail: _trail, ...rest } = change;
  return rest;
}
