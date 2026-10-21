# 18 – Submit a new-hire request from the TOPdesk screen

Status: resolved
Blocked by: 16
Spec: `.scratch/mock-suite/spec.md` §4.6, §5 (Callback A steps 1–2), §5 (disabled mode), §6.1

## In plain words
The demo starts with someone filling in a TOPdesk form for a new employee. Build that form; for now it only creates the incident (starting the Ofelia case comes in ticket 29).

## What will be different afterwards
A `Nieuwe aanvraag indiensttreding` button opens a form pre-filled with Sanne de Vries. Submitting creates an incident in category Personeel / Indiensttreding. With `BONITA_ENABLED=false` the header shows `Ofelia niet verbonden`.

## Example
The presenter clicks the button, leaves the defaults, clicks submit. Incident `I 2610 009` "Indiensttreding Sanne de Vries" appears at the top of the list.

## Before / After
- **Before:** Incidents only come from the API.
- **After:** The demo's first click works from the screen.

## Technical details
Files:
- `web/src/screens/Topdesk.tsx`
- `src/routes/admin.ts`
- `src/routes/topdesk.ts`
- `web/src/components/Shell.tsx`
- `tests/ui/topdesk-form.spec.ts`

- Form fields = section 5 contract; applications as checkboxes SAP, Zaaksysteem, Decos, GIS-viewer; "Wis" link clears.
- `POST /admin/topdesk/onboarding` reuses the incident-create function from `topdesk.ts`; returns `{incident}` (later `{incident, caseId}`).
- `GET /admin/state` adds `config: {bonitaEnabled}`; `Shell` (which already reads that endpoint) shows `Ofelia niet verbonden` when false.

## Acceptance
`npx playwright test tests/ui/topdesk-form.spec.ts` exits 0 (submitting the default form adds an incident with category `Personeel` / `Indiensttreding`).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/18`, merged).
