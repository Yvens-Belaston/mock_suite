import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SCREENS, Shell, useLiveState } from '../components/Shell';

/** Quadrants in keyboard order: `1`–`4` maximise these. */
const QUADRANTS = ['topdesk', 'entra', 'jira', 'teams'] as const;

type Quadrant = (typeof QUADRANTS)[number];

/**
 * Presenter layout (spec 6.5): the four screens as compact iframes in a 2×2 grid.
 * `1`–`4` maximise a quadrant (CSS only, the iframes stay loaded), `Esc` returns to the grid,
 * `R` asks for confirmation and then calls `POST /admin/reset`.
 */
export function Overview() {
  const body = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [maximised, setMaximised] = useState<Quadrant | null>(null);
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});

  onKey.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= QUADRANTS.length) setMaximised(QUADRANTS[n - 1]);
    else if (e.key === 'Escape') setMaximised(null);
    else if (e.key === 'r' || e.key === 'R') {
      if (window.confirm('Demo resetten naar de beginstand?')) void fetch('/admin/reset', { method: 'POST' });
    } else return;
    e.preventDefault();
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Keys pressed while an iframe has focus land in that (same-origin) document: listen there too.
  const listenInFrame = (frame: HTMLIFrameElement) => {
    frame.contentWindow?.addEventListener('keydown', (e) => onKey.current(e));
  };

  // Fill the viewport below the Shell header, whatever its height.
  useLayoutEffect(() => {
    const measure = () => setTop(body.current?.getBoundingClientRect().top ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <Shell screen="overview">
      <div ref={body} className="flex flex-col" style={{ height: `calc(100vh - ${top}px)` }}>
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2 p-2">
          {QUADRANTS.map((key) => (
            <div
              key={key}
              data-maximised={maximised === key || undefined}
              className={
                maximised === key
                  ? 'fixed inset-0 z-40 bg-white'
                  : 'min-h-0 overflow-hidden rounded-md border border-gray-200 bg-white'
              }
            >
              <iframe
                src={`/ui/${key}?compact=1`}
                title={SCREENS[key].title}
                onLoad={(e) => listenInFrame(e.currentTarget)}
                className="block h-full w-full border-0"
              />
            </div>
          ))}
        </div>
        <RequestBar />
      </div>
    </Shell>
  );
}

interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  ms: number;
  at: string;
}

/** How many mock API calls the bar shows. */
const BAR_SIZE = 5;

/** Thin bottom bar with the last mock API calls, newest first (spec 6.5). */
function RequestBar() {
  const { full } = useLiveState('admin'); // refetches on every `admin`/`request` change event
  const requests = (full?.requests ?? []) as RequestLogEntry[];
  const last = requests.slice(-BAR_SIZE).reverse();
  return (
    <ul
      aria-label="Laatste API-aanroepen"
      className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-t border-gray-200 bg-gray-50 px-3 font-mono text-sm whitespace-nowrap text-gray-700"
    >
      {last.length === 0 && <li className="list-none text-gray-400">Nog geen API-aanroepen</li>}
      {last.map((r, i) => (
        <li key={`${r.at}-${r.method}-${r.path}-${i}`} className={r.status >= 400 ? 'text-red-700' : undefined}>
          {`${r.method} ${r.path} ${r.status} · ${r.ms} ms`}
        </li>
      ))}
    </ul>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
