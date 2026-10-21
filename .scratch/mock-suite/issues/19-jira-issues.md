# 19 – Create and read Jira issues

Status: resolved
Blocked by: 04
Spec: `.scratch/mock-suite/spec.md` §4.1, §4.4, §3

## In plain words
Let Bonita create tickets for app owners (e.g. "give Sanne SAP access") in the simulated Jira (Atlassian's ticket tracker), with the real v3 paths.

## What will be different afterwards
`/myself`, `user/search`, create issue and get issue work; keys increment per project (`IAM-105`, `AUTO-105`).

## Example
Bonita looks up Noor Hendriks via `user/search?query=noor.hendriks@…`, POSTs an IAM Task with an ADF description and label `case-1042`, and gets `{"id","key":"IAM-105","self"}` (201). Match the user on `accountId`, not `emailAddress` (real Jira may hide it). Errors use `{"errorMessages":[…],"errors":{…}}`.

## Before / After
- **Before:** No Jira routes.
- **After:** Jira issue creation simulated.

## Technical details
Files:
- `src/routes/jira.ts`
- `seed/jira.json`
- `src/server.ts`
- `tests/jira-issues.test.ts`

- Seed `jira.json`: projects `IAM`, `AUTO`; users Noor Hendriks, Bram Smit, Emma Mulder, `svc-ofelia` ("Ofelia Integratie", returned by `/myself`); 4 issues per project (`-101`…`-104`, mixed statuses).
- Auth: any `Basic`. POST requires `fields.project.key`, `fields.issuetype.name`, `fields.summary`; `description`, if present, must be ADF (plain string → 400). New status `To Do`.
- GET honours `fields=`.

## Acceptance
`npx vitest run tests/jira-issues.test.ts` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/19`, merged).
