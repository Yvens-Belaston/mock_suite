# 28 – Log in to Bonita and retry once on 401

Status: resolved
Blocked by: 01
Spec: `.scratch/mock-suite/spec.md` §5 (Login)

## In plain words
The mock must call into Ofelia (the Bonita platform). Build the small client that logs in, keeps the session, and logs in again once if the session expired.

## What will be different afterwards
`src/bonita.ts` exposes `bonitaFetch(path, init)` that handles login, cookies, the API token header and one retry on 401.

## Example
The first callback triggers `POST /loginservice`; later calls reuse the session. Bonita restarts → a call gets 401 → the client logs in again and the call succeeds.

## Before / After
- **Before:** No way to call Bonita.
- **After:** One reusable, tested Bonita client.

## Technical details
Files:
- `src/bonita.ts`
- `tests/bonita-client.test.ts`

- Login: form `username`, `password`, `redirect=false`; any 2xx = success. Keep `JSESSIONID` and `X-Bonita-API-Token` cookies; send both cookies plus header `X-Bonita-API-Token`.
- Config: `BONITA_URL`, `BONITA_USER`, `BONITA_PASSWORD`, `BONITA_ENABLED`.
- Test uses a Bonita stub (tiny Fastify server in the test).

## Acceptance
`npx vitest run tests/bonita-client.test.ts` exits 0 (login once for two calls; re-login and success after a stubbed 401).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/28`, merged).
