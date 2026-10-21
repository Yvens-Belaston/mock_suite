import type { Live } from '../lib/topdeskTypes';
import { Th } from './Th';

/** Stored TOPdesk person as returned by `/admin/state`.topdesk.persons (spec section 3). */
export interface Person {
  id: string;
  dynamicName: string;
  email?: string;
  department?: { name?: string } | null;
  branch?: { name?: string } | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Newest first (by last update), so a fresh archive or new person sits at the top. */
const byUpdatedDesc = (a: Person, b: Person) => b.updatedAt.localeCompare(a.updatedAt) || a.dynamicName.localeCompare(b.dynamicName);

export function Personen({ live }: { live: Live }) {
  const { state, changed } = live;
  const persons = [...((state?.persons ?? []) as Person[])].sort(byUpdatedDesc);

  return (
    <div className="overflow-x-auto p-4">
      <table aria-label="Personen" className="w-full border-collapse bg-white text-left">
        <thead className="border-b border-gray-200 text-gray-500">
          <tr>
            <Th>Naam</Th>
            <Th>E-mail</Th>
            <Th>Afdeling</Th>
            <Th>Vestiging</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-gray-100 ${p.archived ? 'text-gray-400' : ''} ${changed.has(p.id) ? 'flash' : ''}`}
            >
              <td className={`px-3 py-2 ${p.archived ? 'line-through' : ''}`}>{p.dynamicName}</td>
              <td className="px-3 py-2">{p.email ?? ''}</td>
              <td className="px-3 py-2">{p.department?.name ?? ''}</td>
              <td className="px-3 py-2">{p.branch?.name ?? ''}</td>
              <td className="px-3 py-2">
                {p.archived && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-sm whitespace-nowrap text-red-700">Gearchiveerd</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
