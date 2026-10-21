# 27 – Render MessageCard and plain-text Teams payloads

Status: ready-for-agent
Blocked by: 25
Spec: `.scratch/mock-suite/spec.md` §4.5, §6.4

## In plain words
Older Bonita connectors may send the legacy MessageCard format or plain text. Show those as simple cards too.

## What will be different afterwards
MessageCard and `{"text"}` payloads render as simple cards in the feed.

## Example
A connector posts `{"text":"Laptop klaar"}` to `servicedesk`; the feed shows a card reading "Laptop klaar".

## Before / After
- **Before:** Only Adaptive Cards render.
- **After:** All three accepted payload kinds render.

## Technical details
Files:
- `web/src/screens/Teams.tsx`
- `tests/ui/teams-legacy.spec.ts`

- A `toAdaptiveCard(payload)` function inside the Teams screen: Adaptive wrapper → its content; MessageCard → TextBlocks for `title`/`text` + FactSet from `sections[].facts`; text → one TextBlock.

## Acceptance
`npx playwright test tests/ui/teams-legacy.spec.ts` exits 0 (posting `{"text":"Laptop klaar"}` and a MessageCard to `/teams/hook/servicedesk` shows both as cards containing their text within 1000 ms).
