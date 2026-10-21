# 13 – Answer TOPdesk auth, version and person calls

Status: resolved
Blocked by: 04
Spec: `.scratch/mock-suite/spec.md` §4.1, §4.2, §3

## In plain words
Let Bonita find, create and archive people in the simulated TOPdesk (the city's service desk tool), with the real TOPdesk paths.

## What will be different afterwards
`/tas/api/version`, person search, create and archive work; requests without Basic auth get 401.

## Example
Bonita searches `GET /tas/api/persons?query=email==sanne.devries@…` → 204 (not found), creates her (201), and at offboarding archives her with `{"id":"<reason>"}` → `archived:true`.

## Before / After
- **Before:** No TOPdesk routes.
- **After:** TOPdesk person side works.

## Technical details
Files:
- `src/routes/topdesk.ts`
- `seed/topdesk.json`
- `src/server.ts`
- `tests/topdesk-persons.test.ts`

- Seed `topdesk.json`: the same 10 `persons`, operator groups, categories, 8 incidents (`I 2610 001`–`008`, 6 closed), 3 changes (`C 2610 001`–`003`, `simple_closed`).
- Auth: any `Authorization: Basic …`.
- Person search: FIQL `email==x`, legacy array format; more than `pageSize` (default 50) → 206 + same array; no match → 204 no body; archived persons included unless `;archived==false`. POST requires `surName` only (v2 rule). Archive body `{"id"}` optional; already archived → 400. Unknown top-level fields → 400.

## Acceptance
`npx vitest run tests/topdesk-persons.test.ts` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/13`, merged).
