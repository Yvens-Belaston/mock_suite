# 22 – Open a Jira card to read its description and comments

Status: resolved
Blocked by: 21
Spec: `.scratch/mock-suite/spec.md` §4.4, §6.3

## In plain words
Bonita writes rich descriptions (bold, lists, links). Clicking a card should show them formatted, plus the comments.

## What will be different afterwards
Card click opens a modal rendering ADF paragraphs, bullet lists, bold and links, and the comments.

## Example
The presenter clicks IAM-105 and sees "Geef **Sanne de Vries** toegang tot SAP" with a bullet list and a link.

## Before / After
- **Before:** Card shows summary only.
- **After:** Readable ticket details.

## Technical details
Files:
- `web/src/screens/Jira.tsx`
- `web/src/adf.tsx`
- `tests/ui/jira-modal.spec.ts`

- `adf.tsx`: small recursive renderer for `doc`, `paragraph`, `bulletList`, `listItem`, `text` with marks `strong` and `link`; unknown nodes render their text children.

## Acceptance
`npx playwright test tests/ui/jira-modal.spec.ts` exits 0 (a description with a bold mark renders inside a `<strong>`).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/22`, merged).
