# 24 – Receive Teams workflow webhook messages

Status: resolved
Blocked by: 04
Spec: `.scratch/mock-suite/spec.md` §4.5, §3

## In plain words
Bonita posts notifications into Teams channels through a webhook (a URL that accepts messages). Accept those posts and store them per channel.

## What will be different afterwards
`POST /teams/hook/{channel}` stores the raw payload and returns 202; unknown channel → 404 (mock-only aid). Any `Authorization: Bearer` header is accepted and ignored (tenant-restricted Workflows triggers send one). Attachments carry `"contentUrl": null`.

## Example
Bonita posts the escalation card to `/teams/hook/facilities` → 202; `/admin/state` shows it under `teams.messages`.

## Before / After
- **Before:** Channels exist, no messages.
- **After:** Teams messages simulated.

## Technical details
Files:
- `src/routes/teams.ts`
- `seed/teams.json`
- `src/server.ts`
- `tests/teams-webhook.test.ts`

- Seed: add 2 older messages per channel to `teams.json`.
- Accept Adaptive Card wrapper, legacy `@type: MessageCard`, and `{"text"}`; anything else → 400. No auth.
- Store `{id, channelId, receivedAt, payload}`.

## Acceptance
`npx vitest run tests/teams-webhook.test.ts` exits 0 (202 for each of the 3 payload kinds; 404 unknown channel; 400 garbage).

## Comments

- 2026-10-21: Resolved by /implement-spec on integration branch `mock-suite` (branch `ticket/24`, merged).
