# 33 – Script the Entra steps of the demo with curl

Status: resolved
Blocked by: 09, 10
Spec: `.scratch/mock-suite/spec.md` §9 (steps 1, 5 Graph part)

## In plain words
A presenter needs to rehearse the demo without Bonita. Start a curl script that replays the Entra calls, pausing between calls so someone can watch.

## What will be different afterwards
`scripts/demo-run.sh` runs token → create Sanne → manager → two groups → licence, and the Graph part of offboarding (disable, revoke sessions, remove a group).

## Example
The presenter runs `scripts/demo-run.sh` with the Entra screen open and watches Sanne appear, gain groups, then turn red.

## Before / After
- **Before:** No script.
- **After:** Rehearsable Entra part.

## Technical details
Files:
- `scripts/demo-run.sh`

- `BASE` (default `http://localhost:8090`) and `PAUSE` (default 2) env vars; `curl -fsS` so any failure stops the script (`set -euo pipefail`).
- Offboarding steps go in a final `offboarding` section that later tickets extend.

## Acceptance
`RESPONSE_DELAY_MS=0 BONITA_ENABLED=false npm run dev & sleep 2; BASE=http://localhost:8080 PAUSE=0 scripts/demo-run.sh` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/33`, merged).
