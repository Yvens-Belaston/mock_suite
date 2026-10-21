import type { JiraIssue } from '../lib/jiraTypes';

/** Callback B result on a Jira card or modal: green when Bonita accepted it, red on error. */
export function OfeliaChip({ callback }: { callback: JiraIssue['bonitaCallback'] }) {
  if (!callback) return null;
  const ok = callback.status === 'ok';
  return (
    <span
      data-testid="ofelia-chip"
      data-status={callback.status}
      className={`rounded-full px-2 py-0.5 text-sm font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
      title={callback.httpStatus ? `Bonita HTTP ${callback.httpStatus}` : 'Bonita niet bereikbaar'}
    >
      {ok ? 'Ofelia notified' : `Ofelia fout${callback.httpStatus ? ` (${callback.httpStatus})` : ''}`}
    </span>
  );
}
