# 26 – Add the Teams channel list with unread counters and an all-channels view

Status: resolved
Blocked by: 25
Spec: `.scratch/mock-suite/spec.md` §6.4

## In plain words
With five channels, the presenter needs to see where new messages land, or see everything in one feed for the overview.

## What will be different afterwards
Left rail lists channels with unread counters; an "Alle kanalen" toggle shows every channel in one feed.

## Example
The presenter is on `hr-onboarding`. A message arrives in `facilities`; its counter shows 1. They click it; the counter clears.

## Before / After
- **Before:** One channel visible.
- **After:** Channel navigation and a combined feed.

## Technical details
Files:
- `web/src/screens/Teams.tsx`
- `tests/ui/teams-rail.spec.ts`

- Unread = messages received after the channel was last selected (in memory per tab).

## Acceptance
`npx playwright test tests/ui/teams-rail.spec.ts` exits 0 (a message to a non-selected channel increments its counter).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/26`, merged).
