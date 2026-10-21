# 16 – Show TOPdesk incidents live on the TOPdesk screen

Status: ready-for-agent
Blocked by: 06, 14
Spec: `.scratch/mock-suite/spec.md` §6.1

## In plain words
The audience must see the onboarding request arrive in TOPdesk and see Bonita's notes added to it.

## What will be different afterwards
`/ui/topdesk` lists incidents newest first (Nummer, Korte omschrijving, Aanmelder, Categorie, Status, Extern nummer). Clicking a row opens a side panel with the full request and the actions timeline, newest first.

## Example
Bonita PATCHes `I 2610 009` with an action. The row flashes; the open side panel shows the new action at the top with author and time.

## Before / After
- **Before:** Placeholder page.
- **After:** Live incident list with detail panel.

## Technical details
Files:
- `web/src/screens/Topdesk.tsx`
- `web/src/main.tsx`
- `tests/ui/topdesk.spec.ts`

- Accent `#0E7C7B`; title "ITSM · TOPdesk API (gesimuleerd)". Tabs scaffold (`Meldingen`, `Wijzigingen`, `Personen`) with only Meldingen filled.

## Acceptance
`npx playwright test tests/ui/topdesk.spec.ts` exits 0 (seed incidents visible; an incident created via API appears within 1000 ms with flash).
