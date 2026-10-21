# 03 – Push every state change to browsers over SSE

Status: resolved
Blocked by: 02
Spec: `.scratch/mock-suite/spec.md` §7

## In plain words
Screens need to know the moment something changes. Add a live stream (Server-Sent Events, a one-way browser push over plain HTTP) that sends one message per change.

## What will be different afterwards
`GET /events` stays open and receives `event: change` for every store write, `reset` after a reset, and a heartbeat every 15 s.

## Example
A browser tab is connected to `/events`. A test writes a Graph user to the store; within milliseconds the tab receives `{"system":"graph","entity":"user","action":"created",…}`.

## Before / After
- **Before:** Changes are only visible by re-reading `/admin/state`.
- **After:** Changes are pushed as they happen.

## Technical details
Files:
- `src/store.ts`
- `src/server.ts`
- `tests/events.test.ts`

- Store exposes a Node `EventEmitter`; `/events` subscribes per connection and unsubscribes on close.
- Payload shape and `system`/`action` values exactly as spec §7. Heartbeat = SSE comment `: ping` every 15 s.
- Reset broadcasts `{system:"admin",action:"reset"}`.

## Acceptance
`npx vitest run tests/events.test.ts` exits 0 (opens `/events`, writes to the store, asserts a `change` event arrives within 1000 ms).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/03`, merged).
