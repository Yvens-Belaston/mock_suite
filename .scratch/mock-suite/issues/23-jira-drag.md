# 23 – Drag Jira cards between columns

Status: resolved
Blocked by: 21
Spec: `.scratch/mock-suite/spec.md` §6.3

## In plain words
Presenters like to drag cards. Allow dragging a card to another column as an alternative to the buttons.

## What will be different afterwards
Dropping a card in a column transitions it via the API.

## Example
The presenter drags IAM-105 from In Progress to Done; same effect as clicking `Klaar`.

## Before / After
- **Before:** Buttons only.
- **After:** Buttons or drag.

## Technical details
Files:
- `web/src/screens/Jira.tsx`
- `tests/ui/jira-drag.spec.ts`

- Native HTML5 drag and drop, no library. Drop maps column → transition by `to.name`.

## Acceptance
`npx playwright test tests/ui/jira-drag.spec.ts` exits 0 (`dragTo` Done column → card is in Done).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/23`, merged).
