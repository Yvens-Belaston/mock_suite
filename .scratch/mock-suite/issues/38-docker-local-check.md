# 38 – Build and run the Docker image locally (final check)

Status: ready-for-human
Blocked by: 07, 12, 17, 22, 23, 26, 27, 30, 32, 36, 37
Spec: `.scratch/mock-suite/spec.md` §8

> **Not for agents.** `/implement-spec` and cloud sessions must skip this ticket. A human runs it on a laptop with Docker, after every other ticket is merged into the integration branch.

## In plain words
Prove that the finished suite really starts from the Docker image, on a real machine. This is the last step, done by hand, because the cloud sessions that build everything else cannot run Docker.

## What will be different afterwards
We know the image builds, stays under 200 MB, starts healthy and answers on `localhost:8090`. If it doesn't, the failure is written up as a comment here and fixed before release.

## Example
After the cloud run finishes, the developer checks out the integration branch on their laptop, starts Docker Desktop, and runs the acceptance command. It builds the image, waits for the healthcheck, and `curl localhost:8090/health` returns `{"status":"ok"}`.

## Before / After
- **Before:** Container files exist and pass a text check (ticket 07), but have never been built.
- **After:** The image has been built and run end-to-end on a real machine.

## Technical details
Files: none expected. If the check fails, fix `Dockerfile`, `docker-compose.yml` or `.dockerignore` and log what changed under `## Comments`.

- Blocked by every ticket that nothing else depends on, so it is the last one on the frontier.
- Run from the integration branch tip, with Docker running.

## Acceptance
`docker compose up -d --build --wait && curl -fs localhost:8090/health && docker image inspect ofelia/mock-suite:0.1.0 --format '{{.Size}}' | awk '$1 < 200000000 {ok=1} END {exit !ok}'` exits 0.
