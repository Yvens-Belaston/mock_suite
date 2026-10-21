# 31 – Build the presenter overview with keyboard shortcuts

Status: resolved
Blocked by: 06
Spec: `.scratch/mock-suite/spec.md` §6.5

## In plain words
The presenter shows one screen next to Bonita during the demo: all four systems at once, with shortcuts to zoom in or reset.

## What will be different afterwards
`/ui/overview` shows four iframes (compact mode) in a 2×2 grid. `1`–`4` maximise one, `Esc` returns, `R` asks for confirmation then resets.

## Example
During the Jira part the presenter presses `3`; Jira fills the screen. `Esc` brings back the grid. At the end `R` → confirm → all screens show the seed again.

## Before / After
- **Before:** Four separate tabs.
- **After:** One presenter screen.

## Technical details
Files:
- `web/src/screens/Overview.tsx`
- `web/src/main.tsx`
- `tests/ui/overview.spec.ts`

- Iframes `/ui/{topdesk,entra,jira,teams}?compact=1`; maximise is CSS only (iframes stay loaded). `R` uses `window.confirm` then `POST /admin/reset`.

## Acceptance
`npx playwright test tests/ui/overview.spec.ts` exits 0 (pressing `2` makes the Entra iframe fill the viewport; `Esc` restores 4 visible iframes).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/31`, merged).
