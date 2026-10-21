import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Shell, useLiveState } from '../components/Shell';
import { OnboardingButton } from './OnboardingForm';
import { Wijzigingen } from './TopdeskChanges';
import { Personen } from './TopdeskPersons';

/** Stored TOPdesk incident as returned by `/admin/state`.topdesk.incidents (spec section 3). */
export interface Incident {
  id: string;
  number: string;
  briefDescription: string;
  request: string;
  caller: { id: string; dynamicName: string; email: string } | null;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  operatorGroup: { name: string } | null;
  processingStatus: { name: string } | null;
  closed: boolean;
  externalNumber: string;
  actions: { date: string; text: string; author: string }[];
  createdAt: string;
}

/** The `topdesk` slice of `/admin/state`. Tickets 17 add `changes`/`persons` usage. */
export interface TopdeskState {
  incidents?: Incident[];
  changes?: unknown[];
  persons?: unknown[];
  [key: string]: unknown;
}

export type Live = ReturnType<typeof useLiveState<TopdeskState>>;

const TABS = ['Meldingen', 'Wijzigingen', 'Personen'] as const;
type Tab = (typeof TABS)[number];

const dateTime = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Newest first: incident numbers increase, so sort on number descending. */
const byNumberDesc = (a: Incident, b: Incident) => b.number.localeCompare(a.number);

export function Topdesk() {
  const live = useLiveState<TopdeskState>('topdesk');
  const [tab, setTab] = useState<Tab>('Meldingen');

  return (
    <Shell screen="topdesk">
      <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-6">
        <div role="tablist" aria-label="TOPdesk" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 font-medium ${
                tab === t ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <OnboardingButton />
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'Meldingen' && <Meldingen live={live} />}
        {/* Ticket 17: Wijzigingen and Personen tabs live in TopdeskChanges.tsx / TopdeskPersons.tsx. */}
        {tab === 'Wijzigingen' && <Wijzigingen live={live} />}
        {tab === 'Personen' && <Personen live={live} />}
      </div>
    </Shell>
  );
}

function Meldingen({ live }: { live: Live }) {
  const { state, changed } = live;
  const [openId, setOpenId] = useState<string>();
  const incidents = [...(state?.incidents ?? [])].sort(byNumberDesc);
  const open = incidents.find((i) => i.id === openId);

  return (
    <div className="flex">
      <div className="min-w-0 flex-1 overflow-x-auto p-4">
        <table aria-label="Meldingen" className="w-full border-collapse bg-white text-left">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <Th>Nummer</Th>
              <Th>Korte omschrijving</Th>
              <Th>Aanmelder</Th>
              <Th>Categorie</Th>
              <Th>Status</Th>
              <Th>Extern nummer</Th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr
                key={i.id}
                onClick={() => setOpenId(i.id)}
                className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${i.id === openId ? 'bg-teal-50' : ''} ${
                  changed.has(i.id) ? 'flash' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono whitespace-nowrap">{i.number}</td>
                <td className="px-3 py-2">{i.briefDescription}</td>
                <td className="px-3 py-2">{i.caller?.dynamicName ?? ''}</td>
                <td className="px-3 py-2">{[i.category?.name, i.subcategory?.name].filter(Boolean).join(' / ')}</td>
                <td className="px-3 py-2">
                  <StatusPill closed={i.closed}>{i.processingStatus?.name ?? ''}</StatusPill>
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{i.externalNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <IncidentPanel incident={open} flash={changed.has(open.id)} onClose={() => setOpenId(undefined)} />}
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>;
}

function StatusPill({ closed, children }: { closed: boolean; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-sm ${closed ? 'bg-gray-100 text-gray-600' : 'bg-teal-50 text-[var(--accent)]'}`}>
      {children}
    </span>
  );
}

function IncidentPanel({ incident, flash, onClose }: { incident: Incident; flash: boolean; onClose: () => void }) {
  const actions = [...incident.actions].reverse(); // stored oldest first; show newest first
  return (
    <aside
      aria-label={`Melding ${incident.number}`}
      className="w-[26rem] max-w-[45%] shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-mono text-gray-500">{incident.number}</div>
          <h2 className="font-semibold">{incident.briefDescription}</h2>
        </div>
        <button type="button" aria-label="Sluiten" onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-gray-500">Aanmelder</dt>
        <dd>{incident.caller?.dynamicName}</dd>
        <dt className="text-gray-500">Behandelaarsgroep</dt>
        <dd>{incident.operatorGroup?.name ?? '–'}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>{incident.processingStatus?.name}</dd>
        <dt className="text-gray-500">Extern nummer</dt>
        <dd className="font-mono">{incident.externalNumber || '–'}</dd>
      </dl>
      <h3 className="mt-4 font-semibold">Verzoek</h3>
      <p className="mt-1 whitespace-pre-wrap">{incident.request}</p>
      <h3 className="mt-4 font-semibold">Acties</h3>
      <ol className="mt-2 flex flex-col gap-2">
        {actions.map((a, n) => (
          <li
            key={`${actions.length - n}`}
            className={`rounded-md border-l-4 border-[var(--accent)] bg-gray-50 px-3 py-2 ${flash && n === 0 ? 'flash' : ''}`}
          >
            <div className="text-sm text-gray-500">
              {a.author} · <time dateTime={a.date}>{formatDateTime(a.date)}</time>
            </div>
            <div className="whitespace-pre-wrap">{a.text}</div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
