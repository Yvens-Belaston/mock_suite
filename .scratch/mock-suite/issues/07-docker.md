# 07 – Package the suite as a Docker image with compose

Status: ready-for-agent
Blocked by: 06
Spec: `.scratch/mock-suite/spec.md` §8

## In plain words
Make the whole suite start with one command on any machine, without internet once the image is built.

## What will be different afterwards
`docker compose up` starts the mock on `localhost:8090`; the container reports healthy.

## Example
The presenter runs `docker compose up -d` on a clean laptop, waits, and `curl localhost:8090/health` returns `{"status":"ok"}`.

## Before / After
- **Before:** Runs only via `npm run dev`.
- **After:** A 3-stage image (web build, server build, `node:20-alpine` runtime) under 200 MB, running as non-root.

## Technical details
Files:
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

- Compose file exactly as spec §8 (includes the commented `host.docker.internal` line and Bonita example). Mounts `./seed` and `./config` read-only.
- `HEALTHCHECK` on `/health`. Production dependencies only in the final stage.

## Acceptance
`docker compose up -d --build --wait && curl -fs localhost:8090/health && docker image inspect ofelia/mock-suite:0.1.0 --format '{{.Size}}' | awk '$1 < 200000000 {ok=1} END {exit !ok}'` exits 0.
