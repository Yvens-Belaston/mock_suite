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
  comments: unknown[];
  createdAt: string;
  updatedAt: string;
}

function issues(store: Store): JiraIssue[] {
  return store.get().jira.issues as JiraIssue[];
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
  };
}
