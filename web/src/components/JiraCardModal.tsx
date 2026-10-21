import { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatDateTime } from '../lib/dutchDate';
import type { JiraIssue } from '../lib/jiraTypes';
import { Adf } from './Adf';
import { OfeliaChip } from './OfeliaChip';

interface JiraComment {
  id: string;
  author?: { accountId: string };
  body: unknown;
  created: string;
}

/** Card details: ADF description and comments. Closes on Escape, backdrop click or the close button. */
export function JiraCardModal({
  issue,
  users,
  onClose,
}: {
  issue: JiraIssue;
  users: { accountId: string; displayName: string }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const comments = issue.comments as JiraComment[];
  const titleId = `jira-modal-${issue.key}`;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="font-semibold" style={{ color: 'var(--accent)' }}>
                {issue.key}
              </h2>
              <OfeliaChip callback={issue.bonitaCallback} />
            </div>
            <p className="text-gray-900">{issue.fields.summary}</p>
          </div>
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 text-gray-800">
          {issue.fields.description ? <Adf doc={issue.fields.description} /> : <p className="text-gray-500">Geen beschrijving</p>}
        </div>
        <h3 className="mt-5 mb-2 font-semibold text-gray-700">Opmerkingen ({comments.length})</h3>
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-gray-200 p-2">
              <div className="text-sm text-gray-500">
                {users.find((u) => u.accountId === c.author?.accountId)?.displayName ?? 'Onbekend'} ·{' '}
                {formatDateTime(c.created)}
              </div>
              <Adf doc={c.body} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
