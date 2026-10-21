import { Shell, useLiveState } from '../components/Shell';

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
        <li key={skuId} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          {skus.find((s) => s.skuId === skuId)?.skuPartNumber ?? skuId}
        </li>
      ))}
    </ul>
  );
}

const COLUMNS = ['Weergavenaam', 'UPN', 'Functie', 'Afdeling', 'Manager', 'Licenties', 'Status'];

/** Users table, newest/most recently changed first. `onSelect` is the hook for the side panel (ticket 12). */
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
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

export function Entra() {
  const { state, changed } = useLiveState<GraphState>('graph');
  return (
    <Shell screen="entra">
      <div className="p-4">{state && <UsersTable state={state} changed={changed} />}</div>
    </Shell>
  );
}
