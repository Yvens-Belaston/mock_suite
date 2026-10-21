import * as AC from 'adaptivecards';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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

function MessageItem({ message, flash }: { message: TeamsMessage; flash: boolean }) {
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
      </div>
      <AdaptiveCardView card={card} />
    </li>
  );
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
