# 12 – Show user details, audit trail and groups on the Entra screen

Status: ready-for-agent
Blocked by: 10, 11
Spec: `.scratch/mock-suite/spec.md` §6.2

## In plain words
Clicking a user should prove what Bonita did to that account: its groups, licences, manager and every Graph call that touched it. A groups tab shows who is in which group.

## What will be different afterwards
Side panel with groups, licences, manager, hire date, "Sessies ingetrokken" time, and an audit list. Groups tab with member counts; members expand; new members flash.

## Example
The presenter clicks Sanne de Vries after offboarding. The panel lists `PATCH /v1.0/users/… 09:14`, `POST …/revokeSignInSessions 09:14`, and shows "Sessies ingetrokken 01-12-2026 09:14".

## Before / After
- **Before:** Table only.
- **After:** Full proof of every account change.

## Technical details
Files:
- `web/src/screens/Entra.tsx`
- `tests/ui/entra-panel.spec.ts`

- Audit list = entries from `state.requests` whose path starts with `/v1.0/` and contains the user's id or UPN (current run only). Dates Dutch format `dd-MM-yyyy HH:mm`.

## Acceptance
`npx playwright test tests/ui/entra-panel.spec.ts` exits 0 (after a PATCH on a user, clicking that user shows the PATCH in the audit list; after adding a member, the Groups tab count increments).
