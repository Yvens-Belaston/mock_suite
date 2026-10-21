# 02 – Keep state in memory and restore it from seed on reset

Status: ready-for-agent
Blocked by: 01
Spec: `.scratch/mock-suite/spec.md` §2, §3, §4.6, §7

## In plain words
Add the in-memory store that holds every simulated system's data. It loads the seed at start-up, and `POST /admin/reset` puts it back to the seed.

## What will be different afterwards
`GET /admin/state` shows the full state. `POST /admin/reset` restores the seed in under 1 second. The first seed file (Teams channels) exists.

## Example
A tester changes some state, calls `POST /admin/reset`, then `GET /admin/state`. The output is identical to a freshly started server.

## Before / After
- **Before:** No state.
- **After:** One store module: `get()`, `update(system, fn)`, `reset()`, plus an `events` log.

## Technical details
Files:
- `src/store.ts`
- `src/routes/admin.ts`
- `seed/teams.json`
- `tests/reset.test.ts`
- `src/server.ts`

- Store loads every `seed/*.json`; the file name is the system key (`teams.json` → `state.teams`). Seed `teams.json` holds the 5 `channels` only in this ticket (messages come in ticket 24).
- Deep-clone the seed on load/reset. No persistence to disk.
- Number counters are derived from the seed (highest number + 1), so reset restores them without hard-coded values.
- Every write appends `{system, entity, action, id, summary, at}` to `events`; reset clears `events`.
- `GET /admin/state` returns the state; `POST /admin/reset` returns `204`.

## Acceptance
`npx vitest run tests/reset.test.ts` exits 0 (writes to the store, calls reset, asserts state deep-equals the seed and reset takes < 1000 ms).
