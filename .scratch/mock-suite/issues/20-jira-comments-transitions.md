# 20 – Comment on and transition Jira issues

Status: resolved
Blocked by: 19
Spec: `.scratch/mock-suite/spec.md` §4.4

## In plain words
Let Bonita (and the screen) comment on tickets and move them through To Do → In Progress → Done.

## What will be different afterwards
Comment and transition routes work; moving to Done goes through one function that ticket 30 will hook the Bonita callback into.

## Example
`GET …/IAM-105/transitions` lists three transitions with `to`. `POST` with `{"transition":{"id":"31"}}` → 204; the issue's status is `Done`.

## Before / After
- **Before:** Issues can't change.
- **After:** Full Jira issue lifecycle.

## Technical details
Files:
- `src/routes/jira.ts`
- `tests/jira-transitions.test.ts`

- Comment `body` ADF only; plain string → 400; 201 comment.
- Transitions `{id,name,to:{id,name}}`; ids `11/21/31` are seed values; code acts on `to.name`. Unknown id → 400.
- Export `transitionIssue(key, transitionId)` used by the route (and later the callback).

## Acceptance
`npx vitest run tests/jira-transitions.test.ts` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/20`, merged).
