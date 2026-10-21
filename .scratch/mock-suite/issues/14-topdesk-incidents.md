# 14 – Create, read and update TOPdesk incidents

Status: ready-for-agent
Blocked by: 13
Spec: `.scratch/mock-suite/spec.md` §4.2

## In plain words
Let Bonita (and the onboarding form) record requests as TOPdesk incidents (service-desk tickets) and add progress notes to them.

## What will be different afterwards
Incident create, get by id/number, PATCH and filtered list work; numbers increment `I 2610 009`, `010`…

## Example
A POST with `briefDescription` and `callerLookup.email` returns 201 with number `I 2610 009`. A PATCH with `action: "Account aangemaakt"` adds an entry to the screen timeline. `GET /tas/api/incidents/number/I%202610%20009` returns it.

## Before / After
- **Before:** No incidents API.
- **After:** Incidents fully simulated.

## Technical details
Files:
- `src/routes/topdesk.ts`
- `tests/topdesk-incidents.test.ts`

- POST requires `briefDescription` (max 80 chars) and `caller` or `callerLookup` with exactly one of `{id}`/`{email}` (mock demo validation). Unknown top-level fields → 400.
- PATCH fields: `action` (appends `{date,text,author}` to internal `actions[]`), `processingStatus.name`, `closed`, `externalNumber`, `operatorGroup.name`.
- GET responses expose `action` as a link `/tas/api/incidents/id/{id}/actions`, not the array.
- List: `pageSize`/`pageStart`; FIQL `closed==false` and `externalNumber==X` only; more than `pageSize` (default 10) → 206 + same array + `x-next-page-url` header; no match → 204.

## Acceptance
`npx vitest run tests/topdesk-incidents.test.ts` exits 0.
