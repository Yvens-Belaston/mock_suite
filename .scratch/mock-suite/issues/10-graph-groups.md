# 10 – Manage Graph group memberships

Status: resolved
Blocked by: 08
Spec: `.scratch/mock-suite/spec.md` §4.3

## In plain words
Let Bonita add the new hire to groups (which grant access, e.g. VPN) and remove them again at offboarding.

## What will be different afterwards
Group lookup, add member, remove member and `memberOf` work against state.

## Example
Bonita finds `GG-VPN-Gebruikers` via `$filter=displayName eq 'GG-VPN-Gebruikers'`, adds Sanne (204), adds her again (400), then later removes her (204). `GET /v1.0/users/{sanne}/memberOf` reflects each step.

## Before / After
- **Before:** No group routes.
- **After:** Group membership is fully simulated.

## Technical details
Files:
- `src/routes/graph.ts`
- `tests/graph-groups.test.ts`

- `POST /v1.0/groups/{gid}/members/$ref` with `@odata.id` ending in a user id → 204; already a member → 400.
- `DELETE /v1.0/groups/{gid}/members/{uid}/$ref` → 204; not a member → 404.
- `memberOf` → `{"value":[{"@odata.type":"#microsoft.graph.group","id","displayName"}]}`.

## Acceptance
`npx vitest run tests/graph-groups.test.ts` exits 0.

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/10`, merged).
