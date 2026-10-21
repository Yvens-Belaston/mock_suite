# 04 – Log mock API requests, add artificial latency and optional failures

Status: ready-for-agent
Blocked by: 02
Spec: `.scratch/mock-suite/spec.md` §4.6, §7 (config table), §6.5

## In plain words
The presenter wants to see which calls Bonita made, and calls should feel like real network calls. Record every mock API request, slow it down a bit, and optionally fail a few on purpose.

## What will be different afterwards
`GET /admin/requests?limit=50` lists recent calls. Mock API calls take about `RESPONSE_DELAY_MS`. With `FAIL_RATE` > 0 some return 503. Calls from the screens are excluded from all three.

## Example
Bonita calls `POST /v1.0/users`. The presenter opens `/admin/requests` and sees `POST /v1.0/users 201 · 152 ms` with the request body.

## Before / After
- **Before:** Requests are only printed to stdout.
- **After:** Requests are kept (last 500), delayed, and optionally failed.

## Technical details
Files:
- `src/server.ts`
- `src/store.ts`
- `src/routes/admin.ts`
- `tests/request-log.test.ts`

- "Mock API routes" = paths under `/tas/api`, `/v1.0`, `/rest/api/3`, `/teams/hook`, and `/:tenant/oauth2/v2.0/token`. Never `/admin`, `/events`, `/ui`, `/health`.
- Requests with header `X-Mock-Source: ui` skip delay, fail rate and log.
- Log entry: `{method, path, body, status, ms, at}`; ring buffer of 500 in the store, exposed as `requests` in `GET /admin/state` (used by the Entra audit list and overview bar); cleared on reset. Each new entry also emits an SSE event `{system:"admin",entity:"request",action:"created"}`.
- `RESPONSE_DELAY_MS` default 150 (tests use 0); `FAIL_RATE` default 0 → `503` with an empty body.

## Acceptance
`npx vitest run tests/request-log.test.ts` exits 0 (a mock-route request is listed in `/admin/requests`; the same request with `X-Mock-Source: ui` is not).
