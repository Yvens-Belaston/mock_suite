import { useState } from 'react';
import { formatDateTime } from '../lib/dutchDate';
import type { Live } from '../lib/topdeskTypes';
import { toast } from './Shell';
import { Th } from './Th';

/** Stored TOPdesk operator change as returned by `/admin/state`.topdesk.changes (spec section 3). */
export interface Change {
  id: string;
  number: string;
  briefDescription: string;
  requester: { id?: string; name: string } | null;
  processingStatus: string;
  externalNumber: string;
  createdAt: string;
  updatedAt: string;
}

type Tone = 'grey' | 'blue' | 'green';

/** Spec section 6.1: `processingStatus` -> pill label and colour. */
const STATUS_PILL: Record<string, { label: string; tone: Tone }> = {
  simple_notStarted: { label: 'Aangemeld', tone: 'grey' },
  simple_inProgress: { label: 'In behandeling', tone: 'blue' },
  simple_done: { label: 'Afgerond', tone: 'green' },
  simple_closed: { label: 'Afgerond', tone: 'green' },
};

const TONE_CLASS: Record<Tone, string> = {
  grey: 'bg-gray-100 text-gray-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
};

/** Screen-side auth for the simulated TOPdesk API (any Basic credentials pass). */
const UI_AUTH = `Basic ${btoa('presenter:ui')}`;

/** Transition action that leaves each status, with the status it lands in. */
const NEXT: Record<string, { action: string; to: string } | undefined> = {
  simple_notStarted: { action: 'start', to: 'simple_inProgress' },
  simple_inProgress: { action: 'implement', to: 'simple_done' },
};

/**
 * Walks a change forward to `target` (`simple_inProgress` or `simple_done`) through the same route Bonita uses
 * (`X-Mock-Source: ui`), one transition at a time. The table refreshes from the resulting change events.
 */
async function advance(change: Change, target: string): Promise<void> {
  let from = change.processingStatus;
  while (from !== target) {
    const step = NEXT[from];
    if (!step) return;
    const res = await fetch(`/tas/api/operatorChanges/${encodeURIComponent(change.id)}/processingStatusTransitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: UI_AUTH, 'x-mock-source': 'ui' },
      body: JSON.stringify({ from, action: step.action }),
    });
    if (!res.ok) {
      toast(`${change.number} bijwerken mislukt (${res.status})`, 'error');
      return;
    }
    from = step.to;
  }
}

const byNumberDesc = (a: Change, b: Change) => b.number.localeCompare(a.number);

export function Wijzigingen({ live }: { live: Live }) {
  const { state, changed } = live;
  const [busy, setBusy] = useState<string>();
  const changes = [...((state?.changes ?? []) as Change[])].sort(byNumberDesc);

  const run = async (change: Change, target: string) => {
    setBusy(change.id);
    try {
      await advance(change, target);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="overflow-x-auto p-4">
      <table aria-label="Wijzigingen" className="w-full border-collapse bg-white text-left">
        <thead className="border-b border-gray-200 text-gray-500">
          <tr>
            <Th>Nummer</Th>
            <Th>Korte omschrijving</Th>
            <Th>Aanvrager</Th>
            <Th>Status</Th>
            <Th>Bijgewerkt</Th>
            <Th>Acties</Th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => {
            const pill = STATUS_PILL[c.processingStatus] ?? { label: c.processingStatus, tone: 'grey' as const };
            const disabled = busy === c.id;
            return (
              <tr key={c.id} className={`border-b border-gray-100 ${changed.has(c.id) ? 'flash' : ''}`}>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{c.number}</td>
                <td className="px-3 py-2">{c.briefDescription}</td>
                <td className="px-3 py-2">{c.requester?.name ?? ''}</td>
                <td className="px-3 py-2">
                  <span data-testid="status-pill" className={`rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${TONE_CLASS[pill.tone]}`}>
                    {pill.label}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                  <time dateTime={c.updatedAt}>{formatDateTime(c.updatedAt)}</time>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={disabled || c.processingStatus !== 'simple_notStarted'}
                      onClick={() => run(c, 'simple_inProgress')}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm whitespace-nowrap hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      In behandeling
                    </button>
                    <button
                      type="button"
                      disabled={disabled || !NEXT[c.processingStatus]}
                      onClick={() => run(c, 'simple_done')}
                      className="rounded-md bg-[var(--accent)] px-2 py-1 text-sm whitespace-nowrap text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Afronden
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
