# 08 – Answer Graph token and user lookup calls

Status: resolved
Blocked by: 04
Spec: `.scratch/mock-suite/spec.md` §4.1, §4.3, §3

## In plain words
Let Bonita get a (fake) access token and look up users in the simulated Entra ID (Microsoft's directory of staff accounts), using the real Microsoft Graph paths.

## What will be different afterwards
Token endpoint works; `GET /v1.0/users/{id|upn}` and `GET /v1.0/users?$filter=…` return seed users; missing bearer → 401.

## Example
Bonita posts `client_id`, `client_secret`, `scope`, `grant_type=client_credentials` to `/demo-amsterdam/oauth2/v2.0/token`, gets `mock-…`, then calls `GET /v1.0/users/pieter.bakker@demo-amsterdam.onmicrosoft.com` and receives Pieter Bakker.

## Before / After
- **Before:** No Graph routes.
- **After:** Graph read side works against seed data.

## Technical details
Files:
- `src/routes/graph.ts`
- `seed/graph.json`
- `src/server.ts`
- `tests/graph-read.test.ts`

- Seed `graph.json`: `users` (10 people from spec §3, tenant `demo-amsterdam.onmicrosoft.com`), `groups` (5), `skus` (`M365_E3`, `VISIO_PLAN2`).
- Token: form-encoded; `400 invalid_request` if `grant_type`, `client_id`, `client_secret` or `scope` is missing. Client credentials may also come as `Authorization: Basic`. Token errors use Entra's flat shape `{"error":"invalid_request","error_description":…}`.
- `{x}` matches `id` or `userPrincipalName`. Without `$select` return only Graph's default field set (`businessPhones, displayName, givenName, id, jobTitle, mail, mobilePhone, officeLocation, preferredLanguage, surname, userPrincipalName`); other fields (`accountEnabled`, `department`, `employeeHireDate`, `usageLocation`, `assignedLicenses`) only via `$select`. `$filter` supports `eq` on `userPrincipalName` and `mail` only.
- 404 body `{"error":{"code":"Request_ResourceNotFound","message":…}}` (code seen in practice, not documented; clients branch on status).

## Acceptance
`npx vitest run tests/graph-read.test.ts` exits 0 (token happy + 400; user by id and by UPN; filter; 404; 401 without bearer).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/08`, merged).
