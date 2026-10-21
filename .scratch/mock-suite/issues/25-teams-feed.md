# 25 – Show Teams messages with rendered Adaptive Cards and escalation style

Status: ready-for-agent
Blocked by: 06, 24
Spec: `.scratch/mock-suite/spec.md` §6.4

## In plain words
The audience must see the Teams notifications, including the red escalation when the Facilities task is overdue.

## What will be different afterwards
`/ui/teams` shows the selected channel's feed, newest at the bottom, auto-scrolling; cards rendered with the `adaptivecards` library; escalation cards have a red left border.

## Example
Bonita posts the escalation card (spec §4.5) to `facilities`. It appears at the bottom of the feed within a second, with a red left border; "Open in Ofelia" opens a new tab.

## Before / After
- **Before:** Placeholder page.
- **After:** Live Teams feed.

## Technical details
Files:
- `web/src/screens/Teams.tsx`
- `web/src/main.tsx`
- `tests/ui/teams.spec.ts`
- `package.json`

- Sender "Ofelia Workflow", Dutch time. Supports TextBlock, FactSet, ColumnSet, Image, Container, Action.OpenUrl (`target=_blank`).
- Escalation = first TextBlock starts with ⚠️, or the card contains a Container with `style: "attention"`.

## Acceptance
`npx playwright test tests/ui/teams.spec.ts` exits 0 (posting the spec §4.5 escalation card shows a message with the escalation border within 1000 ms).
