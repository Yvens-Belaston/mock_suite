# 35 – Add the Jira steps to the demo script

Status: resolved
Blocked by: 34, 20
Spec: `.scratch/mock-suite/spec.md` §9 (step 3)

## In plain words
Extend the rehearsal script with the two app-owner tickets and closing one of them.

## What will be different afterwards
Script also creates SAP and Zaaksysteem issues (ADF descriptions, label `case-1042`) and transitions one to Done.

## Example
While rehearsing, two cards appear on the IAM board and one moves to Done.

## Before / After
- **Before:** No Jira steps.
- **After:** Jira steps included.

## Technical details
Files:
- `scripts/demo-run.sh`

- Reads the created key from the POST response with `sed`/`grep` (no `jq` dependency) to transition it.

## Acceptance
Same command as ticket 33 exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/35`, merged).
