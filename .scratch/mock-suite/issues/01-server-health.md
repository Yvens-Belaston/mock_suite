# 01 – Start a server that answers a health check

Status: resolved
Blocked by: none
Spec: `.scratch/mock-suite/spec.md` §2, §4.6

## In plain words
Set up the empty Node.js project and a web server that only says "I'm alive". Everything else builds on this.

## What will be different afterwards
`npm test` runs, and `GET /health` returns `{"status":"ok"}`. Every request is logged to the console.

## Example
A developer runs `npm run dev`, opens `http://localhost:8080/health`, and sees `{"status":"ok"}`. The console shows `GET /health 200 · 2 ms`.

## Before / After
- **Before:** Empty repo.
- **After:** A running Fastify server on `PORT` (default 8080) with one route.

## Technical details
Files:
- `package.json`
- `tsconfig.json`
- `src/server.ts`
- `tests/health.test.ts`

- Node 20, TypeScript strict, Fastify 4, Vitest, supertest. Scripts: `dev`, `build`, `test`.
- `src/server.ts` exports `buildServer()` (used by tests) and starts it when run directly.
- `onResponse` hook logs `METHOD path status · N ms` to stdout.

## Acceptance
`npx vitest run tests/health.test.ts` exits 0 (asserts `GET /health` → 200 `{"status":"ok"}`).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/01`, merged).
