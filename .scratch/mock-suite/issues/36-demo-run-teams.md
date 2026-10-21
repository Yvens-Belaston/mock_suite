# 36 – Add the Teams escalation to the demo script

Status: ready-for-agent
Blocked by: 35, 24
Spec: `.scratch/mock-suite/spec.md` §9 (step 4)

## In plain words
Finish the rehearsal script with the overdue Facilities escalation message.

## What will be different afterwards
Script posts the spec §4.5 escalation card to `/teams/hook/facilities` before the offboarding section.

## Example
While rehearsing, the Teams screen shows the red-bordered escalation card.

## Before / After
- **Before:** No Teams step.
- **After:** Script covers all 5 spec steps.

## Technical details
Files:
- `scripts/demo-run.sh`

- Card JSON inline as a heredoc, identical to spec §4.5.

## Acceptance
Same command as ticket 33 exits 0.
