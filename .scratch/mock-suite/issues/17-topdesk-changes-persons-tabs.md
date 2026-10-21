# 17 – Show TOPdesk changes and persons, with progress buttons

Status: resolved
Blocked by: 15, 16
Spec: `.scratch/mock-suite/spec.md` §6.1

## In plain words
Show the service desk's work orders and their progress, and show archived people (proof of offboarding).

## What will be different afterwards
Wijzigingen tab with status pills and `In behandeling` / `Afronden` buttons; Personen tab with a `Gearchiveerd` badge.

## Example
The presenter clicks `Afronden` on the laptop change. The pill turns green `Afgerond` and Bonita can read the new status.

## Before / After
- **Before:** Incidents only.
- **After:** All three TOPdesk tabs live.

## Technical details
Files:
- `web/src/screens/Topdesk.tsx`
- `tests/ui/topdesk-tabs.spec.ts`

- Pill mapping: `simple_notStarted` → `Aangemeld` grey, `simple_inProgress` → `In behandeling` blue, `simple_done`/`simple_closed` → `Afgerond` green.
- Buttons POST `start` / `implement` to `/tas/api/operatorChanges/{id}/processingStatusTransitions` with `X-Mock-Source: ui` and Basic auth.

## Acceptance
`npx playwright test tests/ui/topdesk-tabs.spec.ts` exits 0 (clicking `Afronden` turns the pill to `Afgerond`; an archived person shows `Gearchiveerd`).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/17`, merged).
