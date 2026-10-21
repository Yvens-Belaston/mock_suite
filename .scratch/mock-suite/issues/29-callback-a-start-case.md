# 29 – Start the Ofelia onboarding case from the TOPdesk form

Status: resolved
Blocked by: 18, 28
Spec: `.scratch/mock-suite/spec.md` §5 (Callback A)

## In plain words
Submitting the TOPdesk form must start a real onboarding case in Ofelia, and show the case number in TOPdesk.

## What will be different afterwards
After submitting, the incident's `externalNumber` is `OFELIA-{caseId}` with action "Ofelia case {caseId} gestart", and a toast says "Ofelia-proces gestart – case {caseId}". On a Bonita error the incident stays, gets action "Fout bij starten Ofelia-proces", and a red toast shows the HTTP status.

## Example
The presenter submits the form. Bonita returns case 1042. The incident row now shows `OFELIA-1042` and the toast confirms.

## Before / After
- **Before:** The form only creates an incident.
- **After:** The form starts the demo's whole process.

## Technical details
Files:
- `src/routes/admin.ts`
- `src/bonita.ts`
- `config/bonita-contract.json`
- `tests/callback-a.test.ts`
- `web/src/screens/Topdesk.tsx`

- Resolve process: `GET /API/bpm/process?f=name={BONITA_ONBOARDING_PROCESS}&f=activationState=ENABLED&p=0&c=1`; instantiate `POST /API/bpm/process/{id}/instantiation`.
- Body built from `config/bonita-contract.json` (`inputName` + `fields` map; unmapped fields dropped; no type conversion). `caseId` read as string or number.
- Errors emit SSE `callback_error` with the status; success `callback_ok`. Skipped when `BONITA_ENABLED=false`. Never crashes.

## Acceptance
`npx vitest run tests/callback-a.test.ts` exits 0 (stub receives the exact contract body; `externalNumber` set; stub 500 → error action and incident kept).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/29`, merged).
