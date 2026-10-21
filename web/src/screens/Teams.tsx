import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, useLiveState } from '../components/Shell';
import { MessageItem, type TeamsMessage } from '../components/TeamsMessage';

interface TeamsChannel {
  id: string;
  name: string;
}

/** Count of messages per channel that are not in `seen`; channels in `visible` count 0 (their feed is on screen). */
function unreadCounts(messages: TeamsMessage[], seen: Set<string> | null, visible: (channelId: string) => boolean) {
  const counts = new Map<string, number>();
  if (!seen) return counts;
  for (const m of messages) {
    if (seen.has(m.id) || visible(m.channelId)) continue;
    counts.set(m.channelId, (counts.get(m.channelId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Spec 6.4: channel rail with unread counters and an "Alle kanalen" toggle, plus the feed.
 * Selected channel = `?channel=<id>`; combined feed = `?all=1` (linkable for the overview layout).
 * Unread = messages that arrived after the channel was last on screen; in memory per tab,
 * so everything present on first load counts as read.
 */
export function Teams() {
  const { state, changed } = useLiveState<{ channels: TeamsChannel[]; messages: TeamsMessage[] }>('teams');
  const [params, setParams] = useSearchParams();
  const channels = state?.channels ?? [];
  const selected = params.get('channel') ?? channels[0]?.id;
  const allChannels = params.get('all') === '1';
  const isVisible = (channelId: string) => allChannels || channelId === selected;

  const messages = useMemo(
    () =>
      (state?.messages ?? [])
        .filter((m) => allChannels || m.channelId === selected)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)), // oldest first: newest at the bottom
    [state?.messages, selected, allChannels],
  );

  // Ids of messages that have been on screen (all of them on first load).
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!state) return;
    setSeen((prev) => {
      const shown = prev ? messages : state.messages;
      if (prev && shown.every((m) => prev.has(m.id))) return prev;
      const next = new Set(prev);
      for (const m of shown) next.add(m.id);
      return next;
    });
  }, [state, messages]);
  const unread = unreadCounts(state?.messages ?? [], seen, isVisible);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  const feed = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const update = (change: (p: URLSearchParams) => void) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      change(next);
      return next;
    });
  const select = (id: string) =>
    update((p) => {
      p.set('channel', id);
      p.delete('all');
    });
  const toggleAll = () => update((p) => (allChannels ? p.delete('all') : p.set('all', '1')));

  return (
    <Shell screen="teams">
      <div className="flex h-[calc(100vh-4rem)]">
        <nav aria-label="Kanalen" className="w-56 shrink-0 border-r border-gray-200 bg-white p-2">
          <button
            type="button"
            aria-pressed={allChannels}
            onClick={toggleAll}
            className={`mb-2 w-full rounded border px-3 py-2 text-left ${allChannels ? 'border-transparent bg-gray-100 font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}
            style={allChannels ? { color: 'var(--accent)' } : undefined}
          >
            Alle kanalen
          </button>
          <ul className="flex flex-col gap-1">
            {channels.map((c) => {
              const current = !allChannels && c.id === selected;
              const count = unread.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => select(c.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left ${current ? 'bg-gray-100 font-semibold' : 'hover:bg-gray-50'}`}
                    style={current ? { color: 'var(--accent)' } : undefined}
                  >
                    <span># {c.name}</span>
                    {count > 0 && (
                      <span
                        data-testid="unread-count"
                        aria-label={`${count} ongelezen`}
                        className="min-w-6 rounded-full px-2 text-center text-sm font-semibold text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div ref={feed} data-testid="teams-feed" className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-gray-500">Nog geen berichten in dit kanaal.</p>
          ) : (
            <ol className="flex max-w-3xl flex-col gap-3">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  flash={changed.has(m.id)}
                  channel={allChannels ? channelName.get(m.channelId) ?? m.channelId : undefined}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </Shell>
  );
}
