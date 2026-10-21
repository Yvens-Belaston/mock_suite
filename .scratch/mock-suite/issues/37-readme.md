# 37 – Write the README for presenters

Status: ready-for-agent
Blocked by: 07, 29
Spec: `.scratch/mock-suite/spec.md` §10 (milestone 8)

## In plain words
A presenter who has never seen this repo must be able to start it, reset it, connect it to Bonita and adapt the contract.

## What will be different afterwards
`README.md` covers: start (`docker compose up`), reset (`R` key / `POST /admin/reset`), connect Bonita (compose network vs `host.docker.internal`, per-connector base URLs), change the contract (`config/bonita-contract.json`), rehearse (`scripts/demo-run.sh`).

## Example
A colleague follows the README on a fresh laptop and has the overview open in under 5 minutes.

## Before / After
- **Before:** No README.
- **After:** Self-serve setup.

## Technical details
Files:
- `README.md`

- Include the per-connector base-URL table (TOPdesk, Graph token, Graph API, Jira, Teams per channel) for both demo and real tenant.

## Acceptance
`grep -q 'host.docker.internal' README.md && grep -q 'bonita-contract.json' README.md && grep -q 'demo-run.sh' README.md` exits 0.
