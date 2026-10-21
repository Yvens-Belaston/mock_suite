import * as AC from 'adaptivecards';
import { useEffect, useMemo, useRef } from 'react';

export interface TeamsMessage {
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

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const card = (body: Json[]): Json => ({ type: 'AdaptiveCard', version: '1.5', body });

/** Legacy connector card: `title` (bold) + `text` TextBlocks, then one FactSet per section with facts. */
function fromMessageCard(payload: Json): Json {
  const body: Json[] = [];
  const title = str(payload.title);
  const text = str(payload.text);
  if (title) body.push({ type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true });
  if (text) body.push({ type: 'TextBlock', text, wrap: true });
  const sections = Array.isArray(payload.sections) ? payload.sections.filter(isObject) : [];
  for (const section of sections) {
    const facts = (Array.isArray(section.facts) ? section.facts.filter(isObject) : [])
      .map((f) => ({ title: String(f.name ?? f.title ?? ''), value: String(f.value ?? '') }));
    if (facts.length > 0) body.push({ type: 'FactSet', facts });
  }
  return card(body);
}

/**
 * The Adaptive Card to render for a webhook payload (spec 4.5): Adaptive wrapper -> its card content;
 * MessageCard -> TextBlocks for `title`/`text` + FactSet from `sections[].facts`; `{text}` -> one TextBlock.
 */
export function toAdaptiveCard(payload: unknown): Json {
  if (isObject(payload) && Array.isArray(payload.attachments)) {
    const att = payload.attachments.find((a) => isObject(a) && a.contentType === ADAPTIVE_CARD && isObject(a.content));
    if (isObject(att)) return att.content as Json;
  }
  if (isObject(payload) && payload['@type'] === 'MessageCard') return fromMessageCard(payload);
  const text = isObject(payload) ? str(payload.text) ?? '' : '';
  return card([{ type: 'TextBlock', text, wrap: true }]);
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

/** One feed entry: sender, Dutch time and the payload rendered as an Adaptive Card (red border on escalation). */
export function MessageItem({ message, flash }: { message: TeamsMessage; flash: boolean }) {
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
