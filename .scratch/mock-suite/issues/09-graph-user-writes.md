# 09 – Create and change Graph users

Status: resolved
Blocked by: 08
Spec: `.scratch/mock-suite/spec.md` §4.3

## In plain words
Let Bonita create the new hire's account, set their manager, assign licences, and later disable the account and end their sessions.

## What will be different afterwards
POST/PATCH user, manager `$ref`, `assignLicense` and `revokeSignInSessions` work and change state, emitting SSE events.

## Example
Bonita creates Sanne de Vries via `POST /v1.0/users` (201, no password echoed), sets Pieter Bakker as manager (204), assigns M365_E3 (200). During offboarding it PATCHes `accountEnabled:false` (204) and revokes sessions (`{"value":true}`).

## Before / After
- **Before:** Users are read-only.
- **After:** Full user lifecycle via real Graph calls.

## Technical details
Files:
- `src/routes/graph.ts`
- `tests/graph-user-writes.test.ts`

- POST requires `accountEnabled`, `displayName`, `mailNickname`, `userPrincipalName`, `passwordProfile.password`; password never stored or returned. Duplicate UPN → 400 `Request_BadRequest`, message containing `already exists`.
- PATCH/manager/assignLicense/revoke accept id or UPN. Manager body `@odata.id` ending in a user id. `assignLicense` requires both `addLicenses` and `removeLicenses` (may be `[]`); user without `usageLocation` → 400. Manager `$ref` takes `id` only (not UPN), as documented. Revoke sets `signInSessionsRevokedAt` and returns `{"@odata.context":"…#Edm.Boolean","value":true}`.

## Acceptance
`npx vitest run tests/graph-user-writes.test.ts` exits 0 (happy path, 400 missing field, 400 duplicate UPN, 404 unknown user, for each route).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/09`, merged).
