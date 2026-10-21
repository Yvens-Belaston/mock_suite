# 21 – Show the Jira board live, with Start and Klaar buttons

Status: resolved
Blocked by: 06, 20
Spec: `.scratch/mock-suite/spec.md` §6.3

## In plain words
The audience must see tickets appear and move to Done. Build the board.

## What will be different afterwards
`/ui/jira` shows a project switcher and To Do / In Progress / Done columns. Cards show key, summary, assignee initials, due date (red if past), label chips and type icon. `Start` and `Klaar` buttons move cards.

## Example
Bonita creates IAM-105. It slides into To Do with a flash. The presenter clicks `Klaar`; the card moves to Done.

## Before / After
- **Before:** Placeholder page.
- **After:** Live board.

## Technical details
Files:
- `web/src/screens/Jira.tsx`
- `web/src/main.tsx`
- `tests/ui/jira.spec.ts`

- Accent `#4F46E5`. Buttons call `POST /rest/api/3/issue/{key}/transitions` with `X-Mock-Source: ui` (same code path as Bonita).

## Acceptance
`npx playwright test tests/ui/jira.spec.ts` exits 0 (an API-created issue appears in To Do within 1000 ms; `Klaar` moves it to Done).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/21`, merged).
