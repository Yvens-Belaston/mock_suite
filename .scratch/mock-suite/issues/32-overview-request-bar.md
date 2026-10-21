# 32 – Show the last 5 API calls under the overview

Status: ready-for-agent
Blocked by: 04, 31
Spec: `.scratch/mock-suite/spec.md` §6.5

## In plain words
The audience should see that real API calls are happening. Show a thin bar with the latest calls.

## What will be different afterwards
Bottom bar on the overview shows the last 5 mock API calls, e.g. `POST /v1.0/users 201 · 12 ms`, updating live.

## Example
Bonita creates a user; within a second the bar's first entry is `POST /v1.0/users 201 · 152 ms`.

## Before / After
- **Before:** Calls visible only in `/admin/requests`.
- **After:** Calls visible on the presenter screen.

## Technical details
Files:
- `web/src/screens/Overview.tsx`
- `tests/ui/overview-bar.spec.ts`

- Uses `useLiveState("admin")` → `state.requests` (last 5).

## Acceptance
`npx playwright test tests/ui/overview-bar.spec.ts` exits 0.
