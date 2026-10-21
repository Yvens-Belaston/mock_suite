import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FLASH_MS, Shell, useChangeEvents, useLiveState } from '../components/Shell';
import { formatDate, formatDateTime } from '../lib/dutchDate';

/** A user as stored in `/admin/state`.graph (see `GraphUser` in `src/routes/graph.ts`). */
export interface EntraUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
  managerId: string | null;
  assignedLicenses: { skuId: string }[];
  employeeHireDate: string | null;
  signInSessionsRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntraGroup {
  id: string;
  displayName: string;
  memberIds: string[];
}

export interface EntraSku {
  skuId: string;
  skuPartNumber: string;
}

export type GraphState = { users: EntraUser[]; groups: EntraGroup[]; skus: EntraSku[] };

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-sm font-medium text-green-700">Actief</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-sm font-medium text-red-700">Uitgeschakeld</span>
  );
}

export function LicenceChips({ user, skus }: { user: EntraUser; skus: EntraSku[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {user.assignedLicenses.map(({ skuId }) => (
        <li key={skuId} className="rounded bg-blue-50 px-1.5 py-0.5 text-sm font-medium text-blue-700">
          {skus.find((s) => s.skuId === skuId)?.skuPartNumber ?? skuId}
        </li>
      ))}
    </ul>
  );
}

const COLUMNS = ['Weergavenaam', 'UPN', 'Functie', 'Afdeling', 'Manager', 'Licenties', 'Status'];

/** Users table, newest/most recently changed first. `onSelect` opens the side panel. */
export function UsersTable({
  state,
  changed,
  onSelect,
}: {
  state: GraphState;
  changed: Set<string>;
  onSelect?: (user: EntraUser) => void;
}) {
  const users = [...state.users].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const nameOf = (id: string | null) => (id ? state.users.find((u) => u.id === id)?.displayName ?? '' : '');
  return (
    <table className="w-full border-collapse bg-white">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          {COLUMNS.map((c) => (
            <th key={c} className="px-3 py-2 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr
            key={u.id}
            data-id={u.id}
            data-disabled={String(!u.accountEnabled)}
            onClick={onSelect && (() => onSelect(u))}
            className={`border-b border-gray-100 ${u.accountEnabled ? '' : 'bg-gray-50 text-gray-400'} ${onSelect ? 'cursor-pointer hover:bg-gray-50' : ''} ${changed.has(u.id) ? 'flash' : ''}`}
          >
            <td className="px-3 py-2">
              <span className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: u.accountEnabled ? 'var(--accent)' : '#9CA3AF' }}
                  aria-hidden="true"
                >
                  {initials(u.displayName)}
                </span>
                <span className={`font-medium ${u.accountEnabled ? 'text-gray-900' : ''}`}>{u.displayName}</span>
              </span>
            </td>
            <td className="px-3 py-2">{u.userPrincipalName}</td>
            <td className="px-3 py-2">{u.jobTitle ?? ''}</td>
            <td className="px-3 py-2">{u.department ?? ''}</td>
            <td className="px-3 py-2">{nameOf(u.managerId)}</td>
            <td className="px-3 py-2">
              <LicenceChips user={u} skus={state.skus} />
            </td>
            <td className="px-3 py-2">
              <StatusBadge enabled={u.accountEnabled} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One `state.requests` entry (see the request log in `src/server.ts`). */
export interface LoggedRequest {
  method: string;
  path: string;
  status: number;
  at: string;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Graph calls (current run) whose path names the user's id or UPN, newest first. */
export function auditFor(user: EntraUser, requests: LoggedRequest[]): LoggedRequest[] {
  const id = user.id.toLowerCase();
  const upn = user.userPrincipalName.toLowerCase();
  return requests
    .filter((r) => {
      if (!r.path.startsWith('/v1.0/')) return false;
      const path = decodePath(r.path).toLowerCase();
      return path.includes(id) || path.includes(upn);
    })
    .reverse();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const none = (text: string) => <span className="text-gray-400">{text}</span>;

/** Side panel: the proof of what happened to one account. */
export function UserPanel({
  user,
  state,
  requests,
  onClose,
}: {
  user: EntraUser;
  state: GraphState;
  requests: LoggedRequest[];
  onClose: () => void;
}) {
  const groups = state.groups.filter((g) => g.memberIds.includes(user.id));
  const manager = user.managerId ? state.users.find((u) => u.id === user.managerId) : undefined;
  const audit = auditFor(user, requests);
  return (
    <aside aria-label={user.displayName} className="w-96 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900">{user.displayName}</h2>
          <p className="break-all text-gray-500">{user.userPrincipalName}</p>
        </div>
        <button type="button" aria-label="Sluiten" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <dl className="space-y-3">
        <Field label="Status">
          <StatusBadge enabled={user.accountEnabled} />
        </Field>
        {user.signInSessionsRevokedAt && (
          <p className="rounded bg-red-50 px-2 py-1 font-medium text-red-700">
            Sessies ingetrokken {formatDateTime(user.signInSessionsRevokedAt)}
          </p>
        )}
        <Field label="Groepen">
          {groups.length ? (
            <ul className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <li key={g.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-medium text-gray-700">
                  {g.displayName}
                </li>
              ))}
            </ul>
          ) : (
            none('Geen')
          )}
        </Field>
        <Field label="Licenties">
          {user.assignedLicenses.length ? <LicenceChips user={user} skus={state.skus} /> : none('Geen')}
        </Field>
        <Field label="Manager">{manager?.displayName ?? none('Geen')}</Field>
        <Field label="Datum in dienst">
          {user.employeeHireDate ? formatDate(user.employeeHireDate) : none('Onbekend')}
        </Field>
      </dl>
      <h3 className="mt-5 mb-2 font-semibold text-gray-900">Audit (Graph-aanroepen)</h3>
      {audit.length === 0 && none('Nog geen aanroepen in deze run.')}
      <ul aria-label="Audit" className="space-y-1 font-mono text-sm">
        {audit.map((r, i) => (
          <li key={`${r.at}-${i}`} className="flex gap-2 border-b border-gray-100 py-1">
            <span className="shrink-0 text-gray-500">{formatDateTime(r.at)}</span>
            <span className="break-all">
              <span className="font-semibold">{r.method}</span> {r.path}
            </span>
            <span className={`ml-auto shrink-0 ${r.status >= 400 ? 'text-red-600' : 'text-green-700'}`}>{r.status}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** `groupId:memberId` pairs added since the previous state, kept for FLASH_MS. */
function useNewMembers(groups: EntraGroup[]): Set<string> {
  const prev = useRef<Map<string, string[]>>();
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(groups.map((g) => [g.id, g.memberIds]));
    if (!before) return;
    const added = new Set<string>();
    for (const g of groups) {
      const old = before.get(g.id) ?? [];
      for (const m of g.memberIds) if (!old.includes(m)) added.add(`${g.id}:${m}`);
    }
    if (added.size === 0) return;
    setFresh(added);
    const t = setTimeout(() => setFresh(new Set()), FLASH_MS);
    return () => clearTimeout(t);
  }, [groups]);
  return fresh;
}

/** Groups with member count; expand to see members; new members flash. */
export function GroupsList({ state, changed }: { state: GraphState; changed: Set<string> }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const fresh = useNewMembers(state.groups);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
      {state.groups.map((g) => {
        const expanded = open.has(g.id);
        const Chevron = expanded ? ChevronDown : ChevronRight;
        return (
          <li key={g.id} data-testid={`group-${g.id}`} className={changed.has(g.id) ? 'flash' : ''}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggle(g.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
            >
              <Chevron className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span className="font-medium text-gray-900">{g.displayName}</span>
              <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-700">
                <span data-testid="member-count">{g.memberIds.length}</span> leden
              </span>
            </button>
            {expanded && (
              <ul className="pb-2 pl-9">
                {g.memberIds.map((id) => {
                  const u = state.users.find((x) => x.id === id);
                  return (
                    <li key={id} className={`py-1 ${fresh.has(`${g.id}:${id}`) ? 'flash' : ''}`}>
                      {u?.displayName ?? id} <span className="text-gray-500">{u?.userPrincipalName}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Tab = 'users' | 'groups';
const TABS: [Tab, string][] = [
  ['users', 'Gebruikers'],
  ['groups', 'Groepen'],
];

export function Entra() {
  const { state, full, changed, refetch } = useLiveState<GraphState>('graph');
  const [tab, setTab] = useState<Tab>('users');
  const [selectedId, setSelectedId] = useState<string>();
  const selected = tab === 'users' ? state?.users.find((u) => u.id === selectedId) : undefined;
  // A call's log entry lands after its graph change event: refresh the open audit list on new log entries.
  useChangeEvents((e) => {
    if (selected && e.system === 'admin' && e.entity === 'request') void refetch();
  });
  const requests = (full?.requests ?? []) as LoggedRequest[];
  return (
    <Shell screen="entra">
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4">
          <div role="tablist" className="mb-3 flex gap-1 border-b border-gray-200">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${tab === key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {state &&
            (tab === 'users' ? (
              <UsersTable state={state} changed={changed} onSelect={(u) => setSelectedId(u.id)} />
            ) : (
              <GroupsList state={state} changed={changed} />
            ))}
        </div>
        {state && selected && (
          <UserPanel user={selected} state={state} requests={requests} onClose={() => setSelectedId(undefined)} />
        )}
      </div>
    </Shell>
  );
}
