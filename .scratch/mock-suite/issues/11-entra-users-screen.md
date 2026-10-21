# 11 – Show Entra users live on the Entra screen

Status: resolved
Blocked by: 06, 09
Spec: `.scratch/mock-suite/spec.md` §6.2

## In plain words
The audience must see accounts appear and get disabled in the simulated Entra ID. Build the users table that updates by itself.

## What will be different afterwards
`/ui/entra` lists all users with initials, name, UPN, function, department, manager, licence chips and status. New or changed users flash yellow and slide in at the top; disabled users are greyed with a red `Uitgeschakeld` badge.

## Example
Bonita creates Sanne de Vries. Within a second her row appears at the top of the Entra screen with a yellow flash and `Actief`. Later, after offboarding, the same row turns grey with a red badge.

## Before / After
- **Before:** Placeholder page.
- **After:** Live users table.

## Technical details
Files:
- `web/src/screens/Entra.tsx`
- `web/src/main.tsx`
- `tests/ui/entra.spec.ts`

- Uses `Shell` (accent `#2563EB`) and `useLiveState("graph")`. Manager name resolved from `managerId`; licence chips show `skuPartNumber`.

## Acceptance
`npx playwright test tests/ui/entra.spec.ts` exits 0 (seed users visible; a user created via `POST /v1.0/users` appears within 1000 ms with the flash class; after PATCH `accountEnabled:false` it shows `Uitgeschakeld`).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/11`, merged).
