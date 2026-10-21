# 34 – Add the TOPdesk steps to the demo script

Status: ready-for-agent
Blocked by: 33, 15
Spec: `.scratch/mock-suite/spec.md` §9 (steps 2, 5 TOPdesk part)

## In plain words
Extend the rehearsal script with the service desk's laptop change and the person archive.

## What will be different afterwards
Script also POSTs the laptop change, moves it to `simple_inProgress` then `simple_done` via `processingStatusTransitions` (`start`, `implement`), and archives Sanne's person record at offboarding.

## Example
While rehearsing, the TOPdesk Wijzigingen tab shows the laptop change go grey → blue → green.

## Before / After
- **Before:** Entra steps only.
- **After:** Entra + TOPdesk steps.

## Technical details
Files:
- `scripts/demo-run.sh`

- Creates the person first if `GET /tas/api/persons?query=email==…` returns 204.

## Acceptance
Same command as ticket 33 exits 0.
