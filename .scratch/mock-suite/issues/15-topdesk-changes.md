# 15 – Create and progress TOPdesk changes

Status: ready-for-agent
Blocked by: 13
Spec: `.scratch/mock-suite/spec.md` §4.2, §3

## In plain words
Let Bonita order work from the service desk (e.g. "prepare laptop") as a TOPdesk change, and let its status move forward exactly like the real TOPdesk API.

## What will be different afterwards
Changes can be created, read, moved through `processingStatus` and given progress notes.

## Example
Bonita POSTs a laptop change → 201, `processingStatus: simple_notStarted`, number `C 2610 004`. A POST to `…/processingStatusTransitions` with `{"from":"simple_notStarted","action":"start"}` → 201, status `simple_inProgress`.

## Before / After
- **Before:** No changes API.
- **After:** Changes simulated with the documented status-transition route.

## Technical details
Files:
- `src/routes/topdesk.ts`
- `tests/topdesk-changes.test.ts`

- POST requires `requester` with one of `id`, `identifier` or `name`; plus `briefDescription` and `changeType` when no `template`.
- Initial `processingStatus` `simple_notStarted` is a demo simplification (real tenants start in `rfc`/`prfc`).
- `POST …/{id}/processingStatusTransitions` `{"from","action"}`: `start` notStarted→inProgress, `implement` inProgress→done, `close` done→closed; wrong `from` or unknown action → 400. Returns 201.
- PATCH: `Content-Type: application/json-patch+json`; only `add /progressTrail`; anything else (incl. `/processingStatus`) → 400. Returns 204.
- `POST /tas/api/operatorChanges/{id}/progresstrail` body `{"memoText","type":"memo"}` (both required) → 201.

## Acceptance
`npx vitest run tests/topdesk-changes.test.ts` exits 0.
