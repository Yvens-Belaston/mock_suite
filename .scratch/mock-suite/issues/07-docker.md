# 07 – Write the Docker image and compose files

Status: resolved
Blocked by: 06
Spec: `.scratch/mock-suite/spec.md` §8

## In plain words
Write the files that will let the whole suite start with one command on any machine, without internet once the image is built. This ticket only writes and checks the files. Building and running the image happens later, on a local machine, in ticket 38, because the cloud sessions have no Docker.

## What will be different afterwards
The repo has a `Dockerfile`, `docker-compose.yml` and `.dockerignore` that match spec §8. A test reads them and fails if a key rule is missing (port, read-only mounts, healthcheck, non-root user).

## Example
An agent writes the three files and runs `npx vitest run tests/docker-files.test.ts`. If someone later deletes the `HEALTHCHECK` line, that test goes red.

## Before / After
- **Before:** Runs only via `npm run dev`. No container files.
- **After:** Container files exist and are checked by a test. They have not been built yet (ticket 38 does that).

## Technical details
Files:
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `tests/docker-files.test.ts`

- 3-stage `Dockerfile`: web build, server build, `node:20-alpine` runtime. Final stage installs production dependencies only, runs as a non-root `USER`, and has a `HEALTHCHECK` on `/health`.
- Compose file exactly as spec §8: image `ofelia/mock-suite:0.1.0`, port `8090`, the commented `host.docker.internal` line and the Bonita example. It mounts `./seed` and `./config` read-only (`:ro`).
- The test reads the files as plain text (no Docker daemon, no new YAML dependency) and checks each rule above.

## Acceptance
`npx vitest run tests/docker-files.test.ts` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/07`, merged).
