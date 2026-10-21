# 05 – Build an empty React app with Vite and Tailwind

Status: ready-for-agent
Blocked by: 01
Spec: `.scratch/mock-suite/spec.md` §2, §6.6

## In plain words
Create the front-end project that all four screens will live in, compiled to static files.

## What will be different afterwards
`npm run build:web` produces `web/dist/` containing a page that shows the `Gesimuleerd` label.

## Example
A developer runs `npm run build:web` and opens `web/dist/index.html`: a white page with a header and the `Gesimuleerd` badge.

## Before / After
- **Before:** No front end.
- **After:** A buildable React 18 + Tailwind app with a router for `/ui/*`.

## Technical details
Files:
- `package.json`
- `vite.config.ts`
- `web/index.html`
- `web/src/main.tsx`
- `web/src/index.css`

- Vite with `base: "/ui/"`, Tailwind via `@tailwindcss/vite`, React Router with placeholder routes `/ui/topdesk`, `/ui/entra`, `/ui/jira`, `/ui/teams`, `/ui/overview`.
- Font Inter/system sans, 14 px body minimum, light mode only. Add `lucide-react` and `@playwright/test` as dependencies now (used from ticket 06).

## Acceptance
`npm run build:web && grep -q Gesimuleerd web/dist/assets/*.js` exits 0.
