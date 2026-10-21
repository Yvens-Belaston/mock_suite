import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One collection map per simulated system, keyed by seed file name (`teams.json` -> `state.teams`). */
export type SystemState = Record<string, unknown>;
export type State = Record<string, SystemState>;

/** Resolves to `<repo>/seed` from both `src/` (tsx/vitest) and `dist/` (node). */
export const DEFAULT_SEED_DIR = fileURLToPath(new URL('../seed/', import.meta.url));

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'reset' | 'callback_ok' | 'callback_error';

/** What a write reports about itself; the store adds `system` and `at`. */
export interface Change {
  entity: string;
  action: ChangeAction;
  id: string;
  summary: string;
}

/** One entry of the events log (spec section 7 payload shape). */
export interface ChangeEvent extends Change {
  system: string;
  at: string;
}

/** One mock API call as the presenter sees it in `/admin/requests` (spec section 4.6). */
export interface RequestLogEntry {
  method: string;
  /** Without query string. */
  path: string;
  body: unknown;
  status: number;
  ms: number;
  at: string;
}

/** How many request log entries the store keeps (oldest dropped first). */
export const REQUEST_LOG_SIZE = 500;

export interface Store {
  /** The live state. Read it freely; write only through `update`. */
  get(): State;
  /** Mutate one system's state in `fn` and return what changed; the change is appended to `events`. */
  update(system: string, fn: (systemState: SystemState) => Change): ChangeEvent;
  /** Every change since start-up or the last reset, oldest first. */
  readonly events: readonly ChangeEvent[];
  /**
   * Register a number counter (e.g. `topdesk.incident`, `jira.IAM`). `highestInSeed` reads the
   * highest number used in the seed; the first `next` returns that + 1, and so again after reset.
   */
  defineCounter(name: string, highestInSeed: (seed: State) => number): void;
  /** Take the next number of a counter registered with `defineCounter`. */
  next(name: string): number;
  /**
   * The single change emitter (feeds `GET /events`). Emits `'change'` with the `ChangeEvent` after
   * every `update`, after every `logRequest` (`admin`/`request`/`created`), and after `reset` with
   * `{ system: 'admin', entity: 'state', action: 'reset', id: '', summary, at }`.
   */
  readonly emitter: EventEmitter;
  /** The last `REQUEST_LOG_SIZE` mock API calls, oldest first. */
  readonly requests: readonly RequestLogEntry[];
  /** Append to the request log and emit an `admin`/`request`/`created` change on `emitter`. */
  logRequest(entry: Omit<RequestLogEntry, 'at'>): RequestLogEntry;
  /** Re-read `seed/*.json` from disk, put every system back to it, restart counters from the seed, clear `events` and `requests`. */
  reset(): void;
}

function loadSeed(seedDir: string): State {
  const seed: State = {};
  for (const file of readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort()) {
    seed[basename(file, '.json')] = JSON.parse(readFileSync(join(seedDir, file), 'utf8')) as SystemState;
  }
  return seed;
}

export function createStore(seedDir: string = DEFAULT_SEED_DIR): Store {
  let seed = loadSeed(seedDir);
  let state: State = structuredClone(seed);
  let events: ChangeEvent[] = [];
  const counterSeeds = new Map<string, (seed: State) => number>();
  let counters = new Map<string, number>();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // one listener per open /events connection
  let requests: RequestLogEntry[] = [];
  let requestSeq = 0;

  return {
    get: () => state,
    emitter,
    get events() {
      return events;
    },
    get requests() {
      return requests;
    },
    logRequest(entry) {
      const logged: RequestLogEntry = { ...entry, at: new Date().toISOString() };
      requests.push(logged);
      if (requests.length > REQUEST_LOG_SIZE) requests.splice(0, requests.length - REQUEST_LOG_SIZE);
      const change: ChangeEvent = {
        system: 'admin',
        entity: 'request',
        action: 'created',
        id: String(++requestSeq),
        summary: `${logged.method} ${logged.path} ${logged.status} · ${logged.ms} ms`,
        at: logged.at,
      };
      emitter.emit('change', change);
      return logged;
    },
    update(system, fn) {
      const systemState = (state[system] ??= {});
      const event: ChangeEvent = { system, ...fn(systemState), at: new Date().toISOString() };
      events.push(event);
      emitter.emit('change', event);
      return event;
    },
    defineCounter(name, highestInSeed) {
      counterSeeds.set(name, highestInSeed);
      counters.set(name, highestInSeed(structuredClone(seed)));
    },
    next(name) {
      const current = counters.get(name);
      if (current === undefined) throw new Error(`Unknown counter "${name}"; call defineCounter first`);
      counters.set(name, current + 1);
      return current + 1;
    },
    reset() {
      try {
        seed = loadSeed(seedDir);
      } catch (err) {
        // A half-edited seed file must not take the demo down: keep the last good seed.
        process.stdout.write(`reset: seed not reloaded (${(err as Error).message}); using the last good seed\n`);
      }
      state = structuredClone(seed);
      events = [];
      requests = [];
      requestSeq = 0;
      counters = new Map([...counterSeeds].map(([name, highest]) => [name, highest(structuredClone(seed))]));
      // Broadcast only: not appended to the (just cleared) events log.
      emitter.emit('change', {
        system: 'admin',
        entity: 'state',
        action: 'reset',
        id: '',
        summary: 'Demo teruggezet naar de beginsituatie',
        at: new Date().toISOString(),
      } satisfies ChangeEvent);
    },
  };
}
