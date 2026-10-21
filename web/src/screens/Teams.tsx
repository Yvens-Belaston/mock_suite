import { useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, useLiveState } from '../components/Shell';
import { MessageItem, type TeamsMessage } from '../components/TeamsMessage';

interface TeamsChannel {
  id: string;
  name: string;
}

/** Spec 6.4: channel rail (ticket 26 adds unread counters / Alle kanalen) + feed of the selected channel. */
export function Teams() {
  const { state, changed } = useLiveState<{ channels: TeamsChannel[]; messages: TeamsMessage[] }>('teams');
  const [params, setParams] = useSearchParams();
  const channels = state?.channels ?? [];
  const selected = params.get('channel') ?? channels[0]?.id;

  const messages = useMemo(
    () =>
      (state?.messages ?? [])
        .filter((m) => m.channelId === selected)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)), // oldest first: newest at the bottom
    [state?.messages, selected],
  );

  const feed = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const select = (id: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('channel', id);
      return next;
    });

  return (
    <Shell screen="teams">
      <div className="flex h-[calc(100vh-4rem)]">
        <nav aria-label="Kanalen" className="w-56 shrink-0 border-r border-gray-200 bg-white p-2">
          <ul className="flex flex-col gap-1">
            {channels.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === selected ? 'true' : undefined}
                  onClick={() => select(c.id)}
                  className={`w-full rounded px-3 py-2 text-left ${c.id === selected ? 'bg-gray-100 font-semibold' : 'hover:bg-gray-50'}`}
                  style={c.id === selected ? { color: 'var(--accent)' } : undefined}
                >
                  # {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div ref={feed} data-testid="teams-feed" className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-gray-500">Nog geen berichten in dit kanaal.</p>
          ) : (
            <ol className="flex max-w-3xl flex-col gap-3">
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} flash={changed.has(m.id)} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </Shell>
  );
}
