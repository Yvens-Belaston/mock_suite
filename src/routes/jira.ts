import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Store } from '../store.js';

export const JIRA_BASE = '/rest/api/3';
const SERVICE_ACCOUNT_EMAIL = 'svc-ofelia@demo-amsterdam.onmicrosoft.com';

export interface JiraUser {
  accountId: string;
  accountType: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

/** Jira's error body: `{"errorMessages":[…],"errors":{"field":"msg"}}`. */
export function jiraError(reply: FastifyReply, status: number, errorMessages: string[], errors: Record<string, string> = {}) {
  return reply.code(status).send({ errorMessages, errors });
}

/** An Atlassian Document Format root node: `{type:'doc', version:1, content:[…]}`. Plain strings are not. */
export function isAdf(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as { type?: unknown; version?: unknown; content?: unknown };
  return doc.type === 'doc' && doc.version === 1 && Array.isArray(doc.content);
}

function users(store: Store): JiraUser[] {
  return store.get().jira.users as JiraUser[];
}

/** The API view of a user (no internal timestamps). */
function toApiUser(u: JiraUser) {
  const { accountId, accountType, displayName, emailAddress, active } = u;
  return { accountId, accountType, displayName, emailAddress, active };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

/** Stored comment; `body` is ADF as received, `author` is expanded in API responses. */
export interface JiraComment {
  id: string;
  author: { accountId: string };
  body: unknown;
  created: string;
  updated: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown> & {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    status: { name: string };
    assignee?: { accountId: string } | null;
  };
  comments: JiraComment[];
  createdAt: string;
  updatedAt: string;
}

function issues(store: Store): JiraIssue[] {
  return store.get().jira.issues as JiraIssue[];
}

const ISSUE_NOT_FOUND = 'Issue does not exist or you do not have permission to see it.';

function findIssue(store: Store, keyOrId: string): JiraIssue | undefined {
  return issues(store).find((i) => i.key === keyOrId || i.id === keyOrId);
}

/** A workflow transition. Ids (`11/21/31`) are seed values only; behaviour keys off `to.name`. */
export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

function transitions(store: Store): JiraTransition[] {
  return store.get().jira.transitions as JiraTransition[];
}

export type TransitionResult =
  | { ok: true; issue: JiraIssue; transition: JiraTransition }
  | { ok: false; reason: 'issue_not_found' | 'unknown_transition' };

/**
 * The one place an issue changes status (API route now; screen buttons and drag go through the route).
 * Acts on the transition's target status (`to.name`), never on the id itself.
 * Ticket 30: hook the Bonita callback here when `transition.to.name === 'Done'`.
 */
export function transitionIssue(store: Store, keyOrId: string, transitionId: string): TransitionResult {
  const found = findIssue(store, keyOrId);
  if (!found) return { ok: false, reason: 'issue_not_found' };
  const transition = transitions(store).find((t) => t.id === transitionId);
  if (!transition) return { ok: false, reason: 'unknown_transition' };

  const key = found.key;
  const status = transition.to.name;
  let issue = found;
  store.update('jira', (jira) => {
    issue = (jira.issues as JiraIssue[]).find((i) => i.key === key)!;
    issue.fields.status = { name: status };
    issue.updatedAt = new Date().toISOString();
    return { entity: 'issue', action: 'updated', id: key, summary: `${key} naar ${status}` };
  });
  return { ok: true, issue, transition };
}

function keyNumber(key: string): number {
  return Number(key.split('-')[1]);
}

/** Issue as the API returns it: project and assignee expanded like real Jira does. */
function toApiIssue(store: Store, issue: JiraIssue, self: string) {
  const { project, assignee } = issue.fields;
  const p = (store.get().jira.projects as JiraProject[]).find((x) => x.key === project.key);
  const a = assignee ? users(store).find((u) => u.accountId === assignee.accountId) : undefined;
  return {
    id: issue.id,
    key: issue.key,
    self,
    fields: {
      ...issue.fields,
      project: p ? { id: p.id, key: p.key, name: p.name } : project,
      assignee: assignee ? (a ? toApiUser(a) : assignee) : null,
      created: issue.createdAt,
      updated: issue.updatedAt,
    },
  };
}

/**
 * Jira's `fields=` param: comma list of field ids, `*all`/`*navigable` for everything (the default),
 * `-name` to drop one. Unknown ids are ignored.
 */
function selectFields(fields: Record<string, unknown>, param: string | undefined): Record<string, unknown> {
  const parts = (param ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const include = parts.filter((p) => !p.startsWith('-'));
  const exclude = new Set(parts.filter((p) => p.startsWith('-')).map((p) => p.slice(1)));
  const all = include.length === 0 || include.some((p) => p === '*all' || p === '*navigable');
  return Object.fromEntries(
    Object.entries(fields).filter(([k]) => !exclude.has(k) && (all || include.includes(k))),
  );
}

export function jiraRoutes(store: Store) {
  return async function (app: FastifyInstance): Promise<void> {
    // Keys increment per project (`IAM-105`, `AUTO-105`); issue ids are numeric strings like real Jira.
    for (const p of store.get().jira.projects as JiraProject[]) {
      store.defineCounter(`jira.${p.key}`, (seed) =>
        Math.max(0, ...(seed.jira.issues as JiraIssue[]).filter((i) => i.fields.project.key === p.key).map((i) => keyNumber(i.key))),
      );
    }
    store.defineCounter('jira.issueId', (seed) => Math.max(10000, ...(seed.jira.issues as JiraIssue[]).map((i) => Number(i.id))));
    store.defineCounter('jira.commentId', (seed) =>
      Math.max(10000, ...(seed.jira.issues as JiraIssue[]).flatMap((i) => i.comments as JiraComment[]).map((c) => Number(c.id))),
    );

    const selfUrl = (req: { protocol: string; headers: { host?: string } }, id: string) =>
      `${req.protocol}://${req.headers.host ?? 'localhost'}${JIRA_BASE}/issue/${id}`;

    // Spec 4.1: any `Basic` credentials are accepted; anything else is 401.
    app.addHook('onRequest', async (req, reply) => {
      if (!/^Basic\s+\S/i.test(req.headers.authorization ?? '')) {
        return jiraError(reply, 401, ['You are not authenticated. Authentication required to perform this operation.']);
      }
    });

    app.get(`${JIRA_BASE}/myself`, async () => {
      const me = users(store).find((u) => u.emailAddress === SERVICE_ACCOUNT_EMAIL);
      return me && toApiUser(me);
    });

    // Real Jira matches the query against display name and e-mail address.
    app.get<{ Querystring: { query?: string } }>(`${JIRA_BASE}/user/search`, async (req) => {
      const q = (req.query.query ?? '').trim().toLowerCase();
      return users(store)
        .filter((u) => u.displayName.toLowerCase().includes(q) || (u.emailAddress ?? '').toLowerCase().includes(q))
        .map(toApiUser);
    });

    app.post<{ Body: { fields?: Record<string, any> } }>(`${JIRA_BASE}/issue`, async (req, reply) => {
      const fields = req.body?.fields ?? {};
      const errors: Record<string, string> = {};
      const projectKey = fields.project?.key;
      if (typeof projectKey !== 'string' || projectKey === '') errors.project = 'Specify a valid project ID or key';
      else if (!(store.get().jira.projects as JiraProject[]).some((p) => p.key === projectKey))
        errors.project = 'valid project is required';
      if (typeof fields.issuetype?.name !== 'string' || fields.issuetype.name === '') errors.issuetype = 'Specify an issue type';
      if (typeof fields.summary !== 'string' || fields.summary.trim() === '') errors.summary = 'You must specify a summary of the issue.';
      if (fields.description != null && !isAdf(fields.description))
        errors.description = 'Operation value must be an Atlassian Document (see the Atlassian Document Format)';
      if (Object.keys(errors).length > 0) return jiraError(reply, 400, [], errors);

      const now = new Date().toISOString();
      const issue: JiraIssue = {
        id: String(store.next('jira.issueId')),
        key: `${projectKey}-${store.next(`jira.${projectKey}`)}`,
        fields: {
          labels: [],
          description: null,
          assignee: null,
          duedate: null,
          priority: { name: 'Medium' },
          ...fields,
          project: { key: projectKey },
          issuetype: { name: String(fields.issuetype.name) },
          summary: String(fields.summary),
          status: { name: 'To Do' },
        },
        comments: [],
        createdAt: now,
        updatedAt: now,
      };
      store.update('jira', (jira) => {
        (jira.issues as JiraIssue[]).push(issue);
        return { entity: 'issue', action: 'created', id: issue.key, summary: `${issue.key} aangemaakt: ${issue.fields.summary}` };
      });
      return reply.code(201).send({ id: issue.id, key: issue.key, self: selfUrl(req, issue.id) });
    });

    app.get<{ Params: { key: string }; Querystring: { fields?: string } }>(`${JIRA_BASE}/issue/:key`, async (req, reply) => {
      const issue = issues(store).find((i) => i.key === req.params.key || i.id === req.params.key);
      if (!issue) return jiraError(reply, 404, ['Issue does not exist or you do not have permission to see it.']);
      const apiIssue = toApiIssue(store, issue, selfUrl(req, issue.id));
      return { ...apiIssue, fields: selectFields(apiIssue.fields, req.query.fields) };
    });

    app.post<{ Params: { key: string }; Body: { body?: unknown } }>(`${JIRA_BASE}/issue/:key/comment`, async (req, reply) => {
      const found = findIssue(store, req.params.key);
      if (!found) return jiraError(reply, 404, [ISSUE_NOT_FOUND]);
      if (!isAdf(req.body?.body))
        return jiraError(reply, 400, [], { body: 'Comment body is not valid! It must be an Atlassian Document (see the Atlassian Document Format)' });

      const me = users(store).find((u) => u.emailAddress === SERVICE_ACCOUNT_EMAIL)!;
      const now = new Date().toISOString();
      const comment: JiraComment = {
        id: String(store.next('jira.commentId')),
        author: { accountId: me.accountId },
        body: req.body!.body,
        created: now,
        updated: now,
      };
      store.update('jira', (jira) => {
        const issue = (jira.issues as JiraIssue[]).find((i) => i.key === found.key)!;
        issue.comments.push(comment);
        issue.updatedAt = now;
        return { entity: 'issue', action: 'updated', id: issue.key, summary: `Opmerking bij ${issue.key}` };
      });
      return reply.code(201).send({
        ...comment,
        self: `${selfUrl(req, found.id)}/comment/${comment.id}`,
        author: toApiUser(me),
        updateAuthor: toApiUser(me),
      });
    });

    app.get<{ Params: { key: string } }>(`${JIRA_BASE}/issue/:key/transitions`, async (req, reply) => {
      if (!findIssue(store, req.params.key)) return jiraError(reply, 404, [ISSUE_NOT_FOUND]);
      return { transitions: transitions(store) };
    });

    app.post<{ Params: { key: string }; Body: { transition?: { id?: unknown } } }>(
      `${JIRA_BASE}/issue/:key/transitions`,
      async (req, reply) => {
        const id = req.body?.transition?.id;
        if (!findIssue(store, req.params.key)) return jiraError(reply, 404, [ISSUE_NOT_FOUND]);
        if (typeof id !== 'string' && typeof id !== 'number') return jiraError(reply, 400, ['Missing transition id.']);
        const result = transitionIssue(store, req.params.key, String(id));
        if (!result.ok) {
          if (result.reason === 'issue_not_found') return jiraError(reply, 404, [ISSUE_NOT_FOUND]);
          return jiraError(reply, 400, [`Transition id '${id}' is not valid for this issue.`]);
        }
        return reply.code(204).send();
      },
    );
  };
}
