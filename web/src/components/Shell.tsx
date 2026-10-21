import { Headset, LayoutGrid, MessageSquare, SquareKanban, Users, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getConnection, isReset, subscribeChanges, subscribeConnection, subscribeOpen, type ChangeEvent } from '../lib/events';
import { changedIds, type SystemState } from '../lib/liveState';
import { dismissToast, getToasts, subscribeToasts, toast } from '../lib/toast';
import { SimulatedBadge } from './SimulatedBadge';

export { toast } from '../lib/toast';
export type { ChangeEvent } from '../lib/events';

/** Per-screen header text, accent colour (spec 6.6) and the state system it follows. */
export const SCREENS = {
  topdesk: { title: 'ITSM', subtitle: 'TOPdesk API (gesimuleerd)', accent: '#0E7C7B', icon: Headset, system: 'topdesk' },
  entra: { title: 'Identiteiten', subtitle: 'Microsoft Graph API (gesimuleerd)', accent: '#2563EB', icon: Users, system: 'graph' },
  jira: { title: 'Jira', subtitle: 'REST API v3 (gesimuleerd)', accent: '#4F46E5', icon: SquareKanban, system: 'jira' },
  teams: { title: 'Teams', subtitle: 'Workflows webhook (gesimuleerd)', accent: '#6D28D9', icon: MessageSquare, system: 'teams' },
  overview: { title: 'Overzicht', subtitle: 'Presentatieweergave', accent: '#374151', icon: LayoutGrid, system: null },
} satisfies Record<string, { title: string; subtitle: string; accent: string; icon: LucideIcon; system: string | null }>;

export type ScreenKey = keyof typeof SCREENS;

/** How long a new or changed item keeps the `flash` class (spec 6: yellow fading over 2 s). */
export const FLASH_MS = 2000;

/** Calls `fn` for every `/events` change (all systems). `fn` may change between renders. */
export function useChangeEvents(fn: (event: ChangeEvent) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribeChanges((e) => ref.current(e)), []);
}

export interface LiveState<T extends SystemState> {
  /** `GET /admin/state`[system]; undefined until the first fetch returns. */
  state: T | undefined;
  /** The whole `GET /admin/state` response (other systems, `events`, `requests`). */
  full: Record<string, unknown> | undefined;
  /** Ids (`id`, or `key`) of items new or changed by a refetch in the last 2 s (each id expires on its own). */
  changed: Set<string>;
  refetch: () => Promise<void>;
}

/**
 * Live data for one system: fetches `/admin/state`, and refetches on every change event for
 * `system`, on reset and on every (re)connect of `/events`.
 */
export function useLiveState<T extends SystemState = SystemState>(system: string): LiveState<T> {
  const [full, setFull] = useState<Record<string, unknown>>();
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const prev = useRef<SystemState>();
  const seq = useRef(0);
  const applied = useRef(0);
  // One expiry timer per flashing id, so a later change does not cut short an earlier item's flash.
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(
    async (baseline: boolean) => {
      const mine = ++seq.current;
      const res = await fetch('/admin/state', { headers: { 'X-Mock-Source': 'ui' } });
      if (!res.ok) return;
      const body = (await res.json()) as Record<string, unknown>;
      // Drop only responses older than the one already shown; dropping every superseded one would starve
      // the screen while change events keep arriving (each refetch overtaken by the next).
      if (mine < applied.current) return;
      applied.current = mine;
      const next = (body[system] ?? {}) as SystemState;
      const ids = changedIds(baseline ? undefined : prev.current, next);
      prev.current = next;
      setFull(body);
      if (ids.size > 0) {
        const timers = flashTimers.current;
        for (const id of ids) {
          clearTimeout(timers.get(id));
          timers.set(
            id,
            setTimeout(() => {
              timers.delete(id);
              setChanged(new Set(timers.keys()));
            }, FLASH_MS),
          );
        }
        setChanged(new Set(timers.keys()));
      }
    },
    [system],
  );

  useEffect(() => {
    void load(true);
    const offOpen = subscribeOpen(() => void load(false));
    const offChange = subscribeChanges((e) => {
      if (isReset(e)) void load(true);
      else if (e.system === system) void load(false);
    });
    return () => {
      offOpen();
      offChange();
      for (const t of flashTimers.current.values()) clearTimeout(t);
      flashTimers.current.clear();
    };
  }, [load, system]);

  return {
    state: full?.[system] as T | undefined,
    full,
    changed,
    refetch: () => load(false),
  };
}

/** `GET /admin/state`.config.bonitaEnabled; undefined until loaded. Read once per page (env can't change at runtime). */
function useBonitaEnabled(): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean>();
  useEffect(() => {
    let live = true;
    fetch('/admin/state', { headers: { 'X-Mock-Source': 'ui' } })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((body: { config?: { bonitaEnabled?: boolean } } | undefined) => {
        if (live && typeof body?.config?.bonitaEnabled === 'boolean') setEnabled(body.config.bonitaEnabled);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}

/** Spec 5 disabled mode: `BONITA_ENABLED=false` shows this in every header. */
function OfeliaOffline() {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-600">
      Ofelia niet verbonden
    </span>
  );
}

function LiveDot() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const connected = connection === 'connected';
  return (
    <span
      data-testid="live-dot"
      data-state={connection}
      title={connected ? 'Live updates verbonden' : 'Live updates niet verbonden'}
      className="ml-auto inline-flex items-center gap-1.5 text-sm text-gray-500"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} aria-hidden="true" />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

const toneClass = {
  info: 'border-gray-200',
  success: 'border-green-300',
  error: 'border-red-300 text-red-800',
};

function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[90vw] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-md border bg-white px-4 py-3 shadow-lg ${toneClass[t.tone]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Sluiten" onClick={() => dismissToast(t.id)} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The frame of every screen: header (icon, title, subtitle, `Gesimuleerd`, live dot) and the toast
 * area. Change events for the screen's system, and resets, show their `summary` as a toast.
 * `?compact=1` (overview iframes) hides the subtitle. Children can use `var(--accent)`.
 */
export function Shell({ screen, children }: { screen: ScreenKey; children?: ReactNode }) {
  const { title, subtitle, accent, icon: Icon, system } = SCREENS[screen];
  const [params] = useSearchParams();
  const compact = params.get('compact') === '1';
  const bonitaEnabled = useBonitaEnabled();

  useChangeEvents((e) => {
    if (isReset(e) || (system !== null && e.system === system)) {
      toast(e.summary, e.action === 'callback_error' ? 'error' : e.action === 'callback_ok' ? 'success' : 'info');
    }
  });

  return (
    <div className="min-h-screen bg-gray-50" style={{ '--accent': accent } as CSSProperties}>
      <header
        className={`flex items-center gap-3 border-t-4 border-b border-b-gray-200 bg-white ${compact ? 'px-4 py-2' : 'px-6 py-3'}`}
        style={{ borderTopColor: accent }}
      >
        <Icon className="h-5 w-5" style={{ color: accent }} aria-hidden="true" />
        <h1 className="font-semibold">{title}</h1>
        {!compact && <span className="text-gray-500">· {subtitle}</span>}
        <SimulatedBadge />
        {bonitaEnabled === false && <OfeliaOffline />}
        <LiveDot />
      </header>
      <main>{children}</main>
      <Toasts />
    </div>
  );
}
