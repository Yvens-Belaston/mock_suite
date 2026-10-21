/** One shared `EventSource('/events')` per page; screens subscribe instead of opening their own. */

/** Spec section 7 payload of `event: change`. */
export interface ChangeEvent {
  system: string;
  entity: string;
  action: string;
  id: string | number;
  summary: string;
  at: string;
}

export type Connection = 'connected' | 'disconnected';

const changeListeners = new Set<(event: ChangeEvent) => void>();
const openListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();
let source: EventSource | undefined;
let status: Connection = 'disconnected';

function setStatus(next: Connection) {
  if (next === status) return;
  status = next;
  for (const fn of statusListeners) fn();
}

function ensureSource() {
  if (source) return;
  source = new EventSource('/events');
  source.addEventListener('open', () => {
    setStatus('connected');
    for (const fn of openListeners) fn();
  });
  // EventSource reconnects by itself; until then the dot is grey.
  source.addEventListener('error', () => setStatus('disconnected'));
  source.addEventListener('change', (e) => {
    const event = JSON.parse((e as MessageEvent<string>).data) as ChangeEvent;
    for (const fn of changeListeners) fn(event);
  });
}

/** Every `change` event, for every system. Returns the unsubscribe function. */
export function subscribeChanges(fn: (event: ChangeEvent) => void): () => void {
  ensureSource();
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Called on every (re)connect of `/events`. */
export function subscribeOpen(fn: () => void): () => void {
  ensureSource();
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}

export function subscribeConnection(fn: () => void): () => void {
  ensureSource();
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function getConnection(): Connection {
  return status;
}

export function isReset(event: ChangeEvent): boolean {
  return event.system === 'admin' && event.action === 'reset';
}
