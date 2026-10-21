# 06 – Serve the screens with a shared header, live dot and toasts

Status: ready-for-agent
Blocked by: 03, 05
Spec: `.scratch/mock-suite/spec.md` §6 (intro), §6.6, §7

## In plain words
Every screen needs the same frame: system name, `Gesimuleerd` badge, a dot showing whether live updates are connected, and pop-up messages. Also make screens refresh themselves when data changes.

## What will be different afterwards
`/ui/*` is served by the mock server. Each screen shows the header; the live dot turns green when `/events` is connected and grey when not. Screens get fresh state on every change.

## Example
The presenter opens `http://localhost:8080/ui/entra`. The header reads "Identiteiten · Microsoft Graph API (gesimuleerd)" with a green dot. They stop the server; the dot turns grey.

## Before / After
- **Before:** The built files are not served; no live behaviour.
- **After:** A `Shell` component and a `useLiveState(system)` hook used by every screen.

## Technical details
Files:
- `src/server.ts`
- `web/src/components/Shell.tsx`
- `web/src/main.tsx`
- `playwright.config.ts`
- `tests/ui/shell.spec.ts`

- Serve `web/dist` at `/ui/` with SPA fallback (`@fastify/static`).
- `Shell.tsx` exports `Shell` (header with title, accent colour, `Gesimuleerd` badge, live dot, toast area) and `useLiveState(system)`: fetches `/admin/state`, refetches on every `change` event for that system, on `reset` and on reconnect; returns the state plus the set of ids that changed since the last fetch (for the 2 s yellow flash).
- `?compact=1` hides the header subtitle (used by the overview).
- Playwright `webServer` builds the web app and starts the server with `RESPONSE_DELAY_MS=0 BONITA_ENABLED=false`.

## Acceptance
`npx playwright test tests/ui/shell.spec.ts` exits 0 (each `/ui/*` route shows `Gesimuleerd`; the live dot reaches the connected state).
