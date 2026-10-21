# 30 – Notify Ofelia when a case-linked Jira issue reaches Done

Status: ready-for-agent
Blocked by: 21, 28
Spec: `.scratch/mock-suite/spec.md` §5 (Callback B), §6.3

## In plain words
When an app owner marks their ticket Done, Ofelia's process must move on. Send Bonita the matching message and show on the card whether it arrived.

## What will be different afterwards
Moving an issue labelled `case-{caseId}` to Done (API, button or drag) sends the Bonita message; the card shows a green "Ofelia notified" chip on 2xx, red on error. Issues without the label send nothing.

## Example
Noor's issue IAM-105 (label `case-1042`) is moved to Done. Bonita receives `accessGranted` with `caseId` 1042 (Long) and `issueKey` IAM-105; the card shows the green chip.

## Before / After
- **Before:** Done is a local status only.
- **After:** Done drives the Ofelia process.

## Technical details
Files:
- `src/routes/jira.ts`
- `src/bonita.ts`
- `tests/callback-b.test.ts`
- `web/src/screens/Jira.tsx`

- `POST /API/bpm/message`: `messageName` = `BONITA_MESSAGE_ACCESS`, `targetProcess` = `BONITA_ONBOARDING_PROCESS`, correlations `caseId` (`java.lang.Long`), `issueKey` (`java.lang.String`), content `issueKey`, `resolvedBy` (assignee `displayName` or `Onbekend`, `java.lang.String`).
- Result stored on the issue as `bonitaCallback: {status: "ok"|"error", httpStatus, at}` and emitted as `callback_ok`/`callback_error`.

## Acceptance
`npx vitest run tests/callback-b.test.ts` exits 0 (exact message body at the stub; unlabelled issue sends nothing; stub 500 → `bonitaCallback.status == "error"`).
