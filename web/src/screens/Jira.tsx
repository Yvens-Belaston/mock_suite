import { useState } from 'react';
import { BookOpen, CheckSquare, Zap, type LucideIcon } from 'lucide-react';
import { Shell, toast, useLiveState } from '../components/Shell';
import { JiraCardModal } from './JiraCardModal';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: unknown;
    assignee: { accountId: string } | null;
    labels: string[];
    duedate: string | null;
    status: { name: string };
  };
  comments: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface JiraUser {
  accountId: string;
  displayName: string;
}

type JiraState = {
  projects: { key: string; name: string }[];
  users: JiraUser[];
  issues: JiraIssue[];
};

export const COLUMNS = ['To Do', 'In Progress', 'Done'] as const;
export type ColumnName = (typeof COLUMNS)[number];

/** Transition ids from `seed/jira.json` per target status. */
const TRANSITION_TO: Record<ColumnName, string> = { 'To Do': '11', 'In Progress': '21', Done: '31' };

/** Screen-side auth for the mock Jira API (any Basic credentials pass). */
const UI_AUTH = `Basic ${btoa('presenter:ui')}`;

/**
 * Moves an issue to `status` through the same route Bonita uses (`X-Mock-Source: ui`), so callback B still fires.
 * The board refreshes from the resulting change event. Shared by the buttons (21) and drag-and-drop (23).
 */
export async function moveIssue(key: string, status: ColumnName): Promise<void> {
  const res = await fetch(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: UI_AUTH, 'x-mock-source': 'ui' },
    body: JSON.stringify({ transition: { id: TRANSITION_TO[status] } }),
  });
  if (!res.ok) toast(`${key} verplaatsen mislukt (${res.status})`, 'error');
}

const TYPE_ICONS: Record<string, LucideIcon> = { Epic: Zap, Story: BookOpen };

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** `2026-12-01` -> `01-12-2026`. */
function dutchDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function isOverdue(iso: string, status: string): boolean {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return status !== 'Done' && iso < todayIso;
}

function Card({
  issue,
  users,
  flash,
  onOpen,
}: {
  issue: JiraIssue;
  users: JiraUser[];
  flash: boolean;
  onOpen: (issue: JiraIssue) => void;
}) {
  const { fields } = issue;
  const TypeIcon = TYPE_ICONS[fields.issuetype.name] ?? CheckSquare;
  const assignee = fields.assignee && users.find((u) => u.accountId === fields.assignee!.accountId);
  const status = fields.status.name;
  return (
    <article
      aria-label={issue.key}
      data-key={issue.key}
      onClick={() => onOpen(issue)}
      className={`cursor-pointer rounded-md border border-gray-200 bg-white p-3 shadow-sm ${flash ? 'flash' : ''}`}
    >
      <div className="flex items-center gap-2 text-gray-500">
        <TypeIcon className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-label={fields.issuetype.name} />
        <span className="font-medium">{issue.key}</span>
        {assignee && (
          <span
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700"
            title={assignee.displayName}
          >
            {initials(assignee.displayName)}
          </span>
        )}
      </div>
      <p className="mt-1 text-gray-900">{fields.summary}</p>
      {fields.labels.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {fields.labels.map((l) => (
            <li key={l} className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
              {l}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-2">
        {fields.duedate && (
          <span
            data-overdue={String(isOverdue(fields.duedate, status))}
            className={isOverdue(fields.duedate, status) ? 'font-medium text-red-600' : 'text-gray-500'}
          >
            {dutchDate(fields.duedate)}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {status === 'To Do' && <CardButton label="Start" onClick={() => moveIssue(issue.key, 'In Progress')} />}
          {status !== 'Done' && <CardButton label="Klaar" onClick={() => moveIssue(issue.key, 'Done')} />}
        </span>
      </div>
    </article>
  );
}

function CardButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded border px-2 py-0.5 text-sm font-medium hover:bg-gray-50"
      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
    >
      {label}
    </button>
  );
}

export function Jira() {
  const { state, changed } = useLiveState<JiraState>('jira');
  const [project, setProject] = useState('IAM');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openIssue = state?.issues.find((i) => i.key === openKey);
  const issues = (state?.issues ?? [])
    .filter((i) => i.fields.project.key === project)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const projects = state?.projects ?? [];

  return (
    <Shell screen="jira">
      <div className="p-4">
        <div role="tablist" aria-label="Project" className="mb-4 flex gap-2">
          {projects.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={p.key === project}
              onClick={() => setProject(p.key)}
              className={`rounded-md border px-3 py-1 font-medium ${p.key === project ? 'text-white' : 'bg-white text-gray-700'}`}
              style={p.key === project ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
              title={p.name}
            >
              {p.key}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const inCol = issues.filter((i) => i.fields.status.name === col);
            return (
              <section key={col} aria-label={col} data-column={col} className="rounded-lg bg-gray-100 p-3">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-700" style={{ fontSize: 14 }}>
                  {col} <span className="text-gray-500">{inCol.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {inCol.map((i) => (
                    <Card
                      key={i.key}
                      issue={i}
                      users={state?.users ?? []}
                      flash={changed.has(i.key)}
                      onOpen={(issue) => setOpenKey(issue.key)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {openIssue && <JiraCardModal issue={openIssue} users={state?.users ?? []} onClose={() => setOpenKey(null)} />}
    </Shell>
  );
}
