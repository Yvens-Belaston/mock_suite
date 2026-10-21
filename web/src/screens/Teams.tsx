import * as AC from 'adaptivecards';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, useLiveState } from '../components/Shell';

interface TeamsChannel {
  id: string;
  name: string;
}

interface TeamsMessage {
  id: string;
  channelId: string;
  receivedAt: string;
  payload: unknown;
}

type Json = Record<string, unknown>;

const ADAPTIVE_CARD = 'application/vnd.microsoft.card.adaptive';
const SENDER = 'Ofelia Workflow';
const ESCALATION_RED = '#DC2626';

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The Adaptive Card to render for a webhook payload. Adaptive wrapper -> its card content.
 * Other payload kinds (MessageCard, `{text}`) are converted by ticket 27; until then they show their text.
 */
export function toAdaptiveCard(payload: unknown): Json {
  if (isObject(payload) && Array.isArray(payload.attachments)) {
    const att = payload.attachments.find((a) => isObject(a) && a.contentType === ADAPTIVE_CARD && isObject(a.content));
    if (isObject(att)) return att.content as Json;
  }
  const text = isObject(payload) && typeof payload.text === 'string' ? payload.text : '';
  return { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text, wrap: true }] };
}

/** Depth-first walk over every element of a card (body items, container items, columns). */
function* elements(items: unknown): Generator<Json> {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!isObject(item)) continue;
    yield item;
    yield* elements(item.items);
    yield* elements(item.columns);
  }
}

/** Spec 6.4: first TextBlock starts with ⚠️, or any Container with `style: "attention"`. */
export function isEscalation(card: Json): boolean {
  const all = [...elements(card.body)];
  const firstText = all.find((e) => e.type === 'TextBlock');
  if (firstText && typeof firstText.text === 'string' && firstText.text.trimStart().startsWith('⚠️')) return true;
  return all.some((e) => e.type === 'Container' && e.style === 'attention');
}

const timeFormat = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `01-12-2026 09:00` in Dutch time (spec 6.6). */
function dutchTime(iso: string): string {
  const p = Object.fromEntries(timeFormat.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** Renders one card with the `adaptivecards` library; Action.OpenUrl opens a new tab. */
function AdaptiveCardView({ card }: { card: Json }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ac = new AC.AdaptiveCard();
    ac.onExecuteAction = (action) => {
      if (action instanceof AC.OpenUrlAction && action.url) window.open(action.url, '_blank', 'noopener');
    };
    ac.parse(card);
    const rendered = ac.render();
    el.replaceChildren(...(rendered ? [rendered] : []));
    return () => el.replaceChildren();
  }, [card]);
  return <div ref={host} className="teams-card" />;
}

/** `channel`: channel name shown in the header, only in the "Alle kanalen" feed (ticket 26). */
function MessageItem({ message, flash, channel }: { message: TeamsMessage; flash: boolean; channel?: string }) {
  const card = useMemo(() => toAdaptiveCard(message.payload), [message.payload]);
  const escalation = isEscalation(card);
  return (
    <li
      data-testid="teams-message"
      data-escalation={escalation ? 'true' : 'false'}
      style={escalation ? { borderLeft: `4px solid ${ESCALATION_RED}` } : undefined}
      className={`rounded-md border border-gray-200 bg-white p-3 shadow-sm ${flash ? 'flash' : ''}`}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-semibold" style={{ color: 'var(--accent)' }}>
          {SENDER}
        </span>
        <time dateTime={message.receivedAt} className="text-gray-500">
          {dutchTime(message.receivedAt)}
        </time>
        {channel && <span className="text-gray-500"># {channel}</span>}
      </div>
      <AdaptiveCardView card={card} />
    </li>
  );
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
