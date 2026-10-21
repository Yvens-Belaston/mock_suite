# Mock Suite Spec – Gemeente Amsterdam Demo

Oct 21, 2026 · @Yvens Belaston

## 1. Context and goal

Build one Docker service, `mock-suite`, that simulates TOPdesk, Microsoft Entra ID (Graph), Jira Cloud and Microsoft Teams for a Bonita (Ofelia) demo to Gemeente Amsterdam. The presenter has no access to any of these four products, so the mocks must expose the **real API paths and payload shapes** and show each system's state on a **live web screen** the audience can watch.

The demo story: a TOPdesk request starts a Bonita onboarding case; Bonita creates an Entra account, TOPdesk changes, Jira tickets and Teams messages; a Facilities task goes overdue and escalates in Teams; offboarding later disables the account. Every one of those effects must appear on screen within 1 second.

The overdue Facilities task is a Bonita human task: a Bonita timer fires and Bonita posts an escalation card to `/teams/hook/facilities`. The mock suite has no Facilities entity; it only displays that message.

**Success criteria**

- Each Bonita connector has its own base URL (Graph: two, token and API; Teams: the full webhook URL per channel), all pointing at `http://mock-suite:8080` for the demo. Switching to real tenants changes only those URLs and credentials: same paths, methods, field names, status codes.
- Four screens (TOPdesk, Entra, Jira, Teams) update live, without manual refresh.
- Two screens send calls back to Bonita: the TOPdesk form starts a case; the Jira "Done" action completes a task.
- `POST /admin/reset` restores the seed data in under 1 second.
- Runs fully offline with `docker compose up`.
- Every screen states clearly that it is a simulation (label `Gesimuleerd`); no vendor logos or copied visual identity.

## 2. Tech stack and repo structure

One Node.js process serves the four mock APIs, the admin API, the live-event stream and the four screens, on port 8080.

| Layer | Choice | Reason |
| --- | --- | --- |
| Runtime | Node.js 20 LTS, TypeScript (strict) | One language for API and UI |
| HTTP server | Fastify 4 | Fast, built-in JSON schema validation |
| Store | In-memory state only (no persistence); seed in `seed/*.json`; inspect via `GET /admin/state` | Simple, resettable; a restart reloads the seed |
| Live updates | Server-Sent Events (`GET /events`) | One-way push, no extra library |
| Screens | React 18 + Vite + Tailwind CSS, built to static files served by Fastify | Fast to build, one bundle |
| Adaptive Cards | `adaptivecards` npm package (renderer) | Renders the exact payload Bonita sends to Teams |
| Tests | Vitest + supertest (API), Playwright (one smoke test per screen) |  |

```
mock-suite/
  src/
    server.ts            # Fastify bootstrap, static files, SSE
    store.ts             # in-memory state, reset, event emitter
    bonita.ts            # client for callbacks into Bonita
    routes/
      topdesk.ts         # /tas/api/*
      graph.ts           # /v1.0/* and token endpoint
      jira.ts            # /rest/api/3/*
      teams.ts           # /teams/hook/:channel
      admin.ts           # /admin/*
  web/
    src/screens/         # Topdesk.tsx, Entra.tsx, Jira.tsx, Teams.tsx, Overview.tsx
    src/components/      # shared: Header, SimulatedBadge, LiveDot, Toast
  seed/                  # persons.json, users.json, groups.json, jira.json, channels.json
  tests/
  Dockerfile
  docker-compose.yml
  README.md
```

## 3. Data model and seed data

All IDs are UUID v4 unless stated. Every record stores `createdAt` and `updatedAt` (ISO 8601). Every write appends an entry to an `events` log used by the screens and by `GET /admin/state`.

| Collection | Key fields | Mirrors |
| --- | --- | --- |
| `topdesk.incidents` | `id`, `number` (format `I 2610 001`, incrementing; prefix `2610` is fixed, not derived from the current date), `briefDescription`, `request`, `caller {id, dynamicName, email}`, `category {name}`, `subcategory {name}`, `operatorGroup {name}`, `processingStatus {name}`, `closed`, `externalNumber`, `actions[] {date, text, author}` | TOPdesk incident |
| `topdesk.changes` | `id`, `number` (format `C 2610 001`, TOPdesk style: `C`, space, 4 digits, space, digits), `briefDescription`, `request`, `changeType` (`simple`), `requester {id, name}`, `processingStatus` (`simple_notStarted`, `simple_inProgress`, `simple_done`, `simple_closed`), `externalNumber`, `progressTrail[] {date, text}` (internal; not returned as text by the API) | TOPdesk operatorChange |
| `topdesk.persons` | `id`, `firstName`, `surName`, `dynamicName`, `email`, `networkLoginName`, `department {name}`, `branch {name}`, `archived` | TOPdesk person |
| `graph.users` | `id`, `displayName`, `givenName`, `surname`, `mailNickname`, `userPrincipalName`, `jobTitle`, `department`, `employeeHireDate`, `usageLocation`, `accountEnabled`, `managerId`, `assignedLicenses[] {skuId}`, `signInSessionsRevokedAt` | Graph user |
| `graph.groups` | `id`, `displayName`, `memberIds[]` | Graph group |
| `graph.skus` | `skuId`, `skuPartNumber` (`M365_E3`, `VISIO_PLAN2`) | Graph subscribedSku |
| `jira.projects` | `key` (`IAM`, `AUTO`), `name` | Jira project |
| `jira.users` | `accountId`, `displayName`, `emailAddress` | Jira user |
| `jira.issues` | `id`, `key` (`IAM-101`, incrementing per project), `fields {project, issuetype, summary, description, assignee, labels[], duedate, priority, status}`, `comments[]`, `bonitaCallback?` | Jira issue |
| `teams.channels` | `id` (slug), `name` | Teams channel |
| `teams.messages` | `id`, `channelId`, `receivedAt`, `payload` (raw JSON as received) | Teams message |

**Seed data (Dutch, fictional; never use real City staff names)**

- Graph tenant domain: `demo-amsterdam.onmicrosoft.com`.
- Graph users (10): managers and staff such as Pieter Bakker (Manager Digitalisering), Fatima El Amrani (HR-adviseur), Daan Visser (Servicedesk), Lotte Jansen (Facilities), Ruben de Boer (Teamlead Facilities), Noor Hendriks (Applicatiebeheer SAP), Bram Smit (Applicatiebeheer Zaaksysteem), Emma Mulder (Automation CoE), Sem van Dijk, Julia Peters. All `accountEnabled: true`, `usageLocation: "NL"`.
- Graph groups: `GG-Digitalisering`, `GG-Sociaal-Domein`, `GG-Facilities`, `GG-Alle-Medewerkers`, `GG-VPN-Gebruikers`.
- TOPdesk persons: the same 10 people; operator groups `Servicedesk`, `Werkplekbeheer`, `Facilities`, `HR`.
- TOPdesk categories: `Personeel` → `Indiensttreding`, `Uitdiensttreding`; `Werkplek` → `Laptop`, `Toegang`.
- TOPdesk history: 6 closed incidents and 2 open ones (`I 2610 001`–`008`), plus 3 closed changes (`C 2610 001`–`003`, `simple_closed`), so the lists never look empty.
- Jira projects: `IAM` (Toegangsbeheer), `AUTO` (Automatisering backlog). Jira users: the app owners above plus Emma Mulder, plus the service account `svc-ofelia` ("Ofelia Integratie", `svc-ofelia@demo-amsterdam.onmicrosoft.com`) returned by `/myself`. 4 existing issues per project, in mixed statuses.
- Teams channels: `hr-onboarding`, `servicedesk`, `facilities`, `automation-coe`, `algemeen`. 2 older messages each.
- The new hire used in the script, **Sanne de Vries** (Business Analist, Digitalisering, start 01-12-2026), must NOT exist in the seed. She is created during the demo.

## 4. API contracts

These paths, methods, field names and status codes copy the public APIs (verified against the vendors' published OpenAPI files, Oct 2026). Unknown fields: TOPdesk rejects unknown top-level fields with `400` (`field does not exist`), as the real API does; Graph and Jira accept and ignore them. Be exactly as strict as the real API: reject what it rejects (e.g. a plain-string comment in Jira v3), never require more than it does. Validate only the required fields listed; on failure return `400` with a JSON body in the vendor's error style. Log every request (method, path, status, ms) to stdout.

### 4.1 Authentication (accept, don't enforce)

- TOPdesk: require an `Authorization: Basic …` header; any value is accepted. Missing header returns `401`.
- Graph: `POST /{tenantId}/oauth2/v2.0/token` (form-encoded, `grant_type=client_credentials`) with `client_id`, `client_secret` and `scope` present (any value; `400` `invalid_request` if missing; client credentials may also come in an `Authorization: Basic` header instead of `client_secret`) returns `{"token_type":"Bearer","expires_in":3599,"access_token":"mock-<random>"}`. In production this endpoint lives on `login.microsoftonline.com`, a different host from Graph. Token errors use Entra's flat shape `{"error":"invalid_request","error_description":"…"}`, not Graph's error object. Graph routes require `Authorization: Bearer …`; any value is accepted.
- Jira: require `Authorization: Basic …`; any value is accepted.
- Teams: no auth; the channel is in the URL. This matches a Workflows trigger set to "Anyone". Triggers limited to tenant users need `Authorization: Bearer …`, which the mock accepts and ignores.

### 4.2 TOPdesk (`/tas/api`)

| Method | Path | Required body fields | Response |
| --- | --- | --- | --- |
| GET | `/tas/api/version` | none | `{"version":"3.x-mock"}` |
| POST | `/tas/api/incidents` | none required by the OpenAPI; the mock requires `briefDescription` (max 80 chars, else `400`) and one caller form (`caller`, or `callerLookup` with exactly one of `{id}` / `{email}`) as demo validation | `201` + full incident; `number` generated |
| GET | `/tas/api/incidents/id/{id}` | none | incident or `404` |
| GET | `/tas/api/incidents/number/{number}` | none | incident or `404` (number is URL-encoded, spaces allowed) |
| PATCH | `/tas/api/incidents/id/{id}` and `/number/{number}` | any subset: `action` (string, appended to `actions[]`), `processingStatus.name`, `closed`, `externalNumber`, `operatorGroup.name` | `200` + updated incident |
| GET | `/tas/api/incidents?query=…&pageSize=…&pageStart=…` | none | `200` + array; `206` + same array and an `x-next-page-url` header when more results exist than `pageSize` (default 10); `204` no body when nothing matches; support `closed==false` and `externalNumber==X` FIQL filters only |
| POST | `/tas/api/operatorChanges` | `requester` with one of `id`, `identifier` (UUID, email or name) or `name`; plus `briefDescription` and `changeType` when no `template` is given | `201` + change; `processingStatus` = `simple_notStarted` (demo simplification: real tenants create new changes in the `rfc` or `prfc` phase, so Bonita must not rely on the initial status) |
| GET | `/tas/api/operatorChanges/{id}` | none | change or `404` |
| PATCH | `/tas/api/operatorChanges/{id}` | JSON Patch list (`Content-Type: application/json-patch+json`); support only `{"op":"add","path":"/progressTrail","value":"text"}`; any other op or path (including `/processingStatus`, which is not a documented updatable field) → `400` | `204` no body |
| POST | `/tas/api/operatorChanges/{id}/processingStatusTransitions` | `{"from":"<current status>","action":…}`; `start` (`simple_notStarted` → `simple_inProgress`), `implement` (`simple_inProgress` → `simple_done`), `close` (`simple_done` → `simple_closed`); `from` not equal to the current status, or unknown action → `400` | `201` |
| POST | `/tas/api/operatorChanges/{id}/progresstrail` | `{"memoText":"…","type":"memo"}` (both required; optional `textFormatting`: `plain`\|`html`); `{id}` is a UUID | `201` |
| GET | `/tas/api/persons?query=email=={email}` | none | `200` + array (legacy format, no `Accept` v2 header); `206` + same array when more results exist than `pageSize` (default 50); `204` no body when nothing matches. Archived persons are included unless the query contains `;archived==false` |
| POST | `/tas/api/persons` | `surName` (v2, `Accept: application/x.topdesk-person-v2+json`; legacy without that header also requires `branch`). The mock enforces v2: `surName` only | `201` + person |
| PATCH | `/tas/api/persons/id/{id}/archive` | `{"id":"<archivingReasonId>"}` (required on real tenants unless a default archiving reason is set; the mock accepts it missing) | `200` + person with `archived: true`; already archived → `400` |

`action` on incident POST/PATCH appends to the progress trail (stored internally as `actions[]` for the screen). In GET responses `action` is a link (`/tas/api/incidents/id/{id}/actions`), not an array; that GET route itself is not implemented.

### 4.3 Microsoft Graph (`/v1.0`)

| Method | Path | Required body fields | Response |
| --- | --- | --- | --- |
| GET | `/v1.0/users/{id or userPrincipalName}` | none | user. Without `$select`, return only Graph's default set (`businessPhones, displayName, givenName, id, jobTitle, mail, mobilePhone, officeLocation, preferredLanguage, surname, userPrincipalName`); fields such as `accountEnabled`, `department`, `employeeHireDate`, `usageLocation`, `assignedLicenses` only with `$select`. Unknown user → `404` with Graph error `Request_ResourceNotFound` (code seen in practice, not documented; clients must branch on HTTP status, not on `code`/`message`) |
| GET | `/v1.0/users?$filter=userPrincipalName eq '…'` | none | `{"value":[…]}`; support `eq` on `userPrincipalName` and `mail` only |
| POST | `/v1.0/users` | `accountEnabled`, `displayName`, `mailNickname`, `userPrincipalName`, `passwordProfile.password` | `201` + user (never echo the password); duplicate UPN returns `400` with code `Request_BadRequest` and message containing `already exists` (seen in practice, not documented; clients must branch on HTTP status) |
| PATCH | `/v1.0/users/{id}` | any subset (e.g. `accountEnabled`) | `204` no body |
| PUT | `/v1.0/users/{id}/manager/$ref` | `@odata.id` ending in a user id | `204` |
| GET | `/v1.0/users/{id}/memberOf` | none | `{"value":[{"@odata.type":"#microsoft.graph.group","id","displayName"}]}` |
| POST | `/v1.0/users/{id}/assignLicense` | `addLicenses[]`, `removeLicenses[]` | `200` + user; user without `usageLocation` → `400` (Graph requires `usageLocation` for licensed users) |
| POST | `/v1.0/users/{id}/revokeSignInSessions` | empty | `200` `{"value":true}` |
| POST | `/v1.0/groups/{groupId}/members/$ref` | `@odata.id` ending in a user id | `204`; already a member returns `400` |
| DELETE | `/v1.0/groups/{groupId}/members/{userId}/$ref` | none | `204` |
| GET | `/v1.0/groups?$filter=displayName eq '…'` | none | `{"value":[…]}` |

Every `/v1.0/users/{x}` route accepts either the user `id` or the `userPrincipalName` as `{x}`, except `PUT /users/{id}/manager/$ref`, which is documented with `id` only.

Graph error shape: `{"error":{"code":"…","message":"…"}}`.

### 4.4 Jira Cloud (`/rest/api/3`)

| Method | Path | Required body fields | Response |
| --- | --- | --- | --- |
| GET | `/rest/api/3/myself` | none | service account user |
| GET | `/rest/api/3/user/search?query={email}` | none | array of users. Real Jira may omit `emailAddress` (privacy settings): match users on `accountId` after the search, not on `emailAddress` |
| POST | `/rest/api/3/issue` | `fields.project.key`, `fields.issuetype.name`, `fields.summary` | `201` `{"id","key","self"}`; status = `To Do`. On a real project the required fields come from create-issue metadata and the initial status from the workflow |
| GET | `/rest/api/3/issue/{key}` | none | `{id,key,fields{…, status{name}}}` (respect `fields=` param) |
| POST | `/rest/api/3/issue/{key}/comment` | `body` (ADF only; plain string → `400`) | `201` comment |
| GET | `/rest/api/3/issue/{key}/transitions` | none | `{"transitions":[{"id":"11","name":"To Do","to":{"id":"1","name":"To Do"}},{"id":"21","name":"In Progress","to":{…}},{"id":"31","name":"Done","to":{…}}]}`; ids are seed values only, code acts on the target status |
| POST | `/rest/api/3/issue/{key}/transitions` | `transition.id` | `204`; status changes; moving to Done fires the Bonita callback (section 5) |

`description` and comment `body` must be Atlassian Document Format (ADF, Jira's JSON rich-text format), as in the real v3 API; a plain string returns `400`. Store as received and render ADF paragraphs, bullet lists and text marks (bold, links) on screen. No `/rest/api/2/` routes. Jira error body: `{"errorMessages":[…],"errors":{"field":"msg"}}`.

### 4.5 Teams Workflows webhook

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/teams/hook/{channelId}` | `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","contentUrl":null,"content":{AdaptiveCard}}]}`; also accept a legacy MessageCard (`@type: MessageCard`) and plain `{"text":"…"}` | `202` empty body. Unknown channel returns `404` (mock-only setup aid; the real Workflows trigger answers `202 Accepted` when the flow has no Response action) |

Escalation card example (used by `scripts/demo-run.sh` and the Teams smoke test):

```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "contentUrl": null,
    "content": {
      "type": "AdaptiveCard", "version": "1.5",
      "body": [{ "type": "Container", "style": "attention", "items": [
          { "type": "TextBlock", "text": "⚠️ Taak verlopen: werkplek inrichten", "weight": "Bolder", "size": "Medium" },
          { "type": "FactSet", "facts": [
            { "title": "Medewerker", "value": "Sanne de Vries" },
            { "title": "Startdatum", "value": "01-12-2026" },
            { "title": "Verantwoordelijk", "value": "Lotte Jansen (Facilities)" },
            { "title": "Escalatie naar", "value": "Ruben de Boer" }
          ]}
      ]}],
      "actions": [{ "type": "Action.OpenUrl", "title": "Open in Ofelia", "url": "http://localhost:8080/bonita/apps/userAppBonita/task-list" }]
    }
  }]
}
```

### 4.6 Admin and helper routes

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/admin/reset` | Restore seed data, clear events, broadcast `reset` |
| GET | `/admin/state` | Full state as JSON (debug) |
| GET | `/admin/requests?limit=50` | Last requests received (method, path, body, status, ms), for the presenter. Keeps the last 500; cleared on reset |
| POST | `/admin/topdesk/onboarding` | Used by the TOPdesk screen form; creates the incident, then starts the Bonita case (section 5) |
| GET | `/health` | `{"status":"ok"}` |
| GET | `/events` | SSE stream (section 7) |

## 5. Bonita integration (callbacks into Bonita)

The mock suite calls Bonita in exactly two situations. Both go through `src/bonita.ts`, which logs in once, caches the session and retries once on `401`.

**Login (Bonita REST API)**

1. `POST {BONITA_URL}/loginservice` with form fields `username`, `password`, `redirect=false`.
2. Treat any `2xx` as success (Bonita answers `204`). Keep the `JSESSIONID` cookie and read the `X-Bonita-API-Token` cookie; send both on every following call (cookie + header `X-Bonita-API-Token`).

**Callback A: start onboarding (from the TOPdesk screen form)**

1. `POST /admin/topdesk/onboarding` receives the form data.
2. The mock creates a TOPdesk incident (category `Personeel` / `Indiensttreding`) and broadcasts it.
3. `GET {BONITA_URL}/API/bpm/process?f=name={BONITA_ONBOARDING_PROCESS}&f=activationState=ENABLED&p=0&c=1` to resolve the process id.
4. `POST {BONITA_URL}/API/bpm/process/{processId}/instantiation` with the contract:

```json
{
  "onboardingInput": {
    "firstName": "Sanne",
    "lastName": "de Vries",
    "startDate": "2026-12-01",
    "department": "Digitalisering",
    "role": "Business Analist",
    "location": "Stadhuis Amstel 1",
    "equipmentProfile": "Standaard laptop",
    "parking": false,
    "applications": ["SAP", "Zaaksysteem"],
    "managerEmail": "pieter.bakker@demo-amsterdam.onmicrosoft.com",
    "topdeskIncidentNumber": "I 2610 009"
  }
}
```

5. Read `caseId` from the response (string or number; accept both). Store it in the incident `externalNumber` (`OFELIA-{caseId}`) and append an action "Ofelia case {caseId} gestart".
6. On any Bonita error: keep the incident, append action "Fout bij starten Ofelia-proces", show a red toast on the TOPdesk screen with the HTTP status. Never crash.

The contract input name (`onboardingInput`) and field names must be configurable in `config/bonita-contract.json` because the Bonita process may change:

```json
{ "inputName": "onboardingInput",
  "fields": { "firstName": "firstName", "lastName": "lastName", "startDate": "startDate" } }
```

Keys are form fields, values are contract field names; a form field missing from `fields` is not sent. Rename and drop only, no type conversion.

**Callback B: Jira issue moved to Done**

When an issue reaches status `Done` (via the screen button or the transitions API) and has a label `case-{caseId}`. The Bonita connector adds this label when it creates the issue; the mock never adds it. Issues without the label fire no callback.

- `POST {BONITA_URL}/API/bpm/message` with:

```json
{
  "messageName": "accessGranted",
  "targetProcess": "MedewerkerOnboarding",
  "correlations": {
    "caseId": { "value": "1042", "type": "java.lang.Long" },
    "issueKey": { "value": "IAM-105", "type": "java.lang.String" }
  },
  "messageContent": {
    "issueKey": { "value": "IAM-105", "type": "java.lang.String" },
    "resolvedBy": { "value": "Noor Hendriks", "type": "java.lang.String" }
  }
}
```

- Types are always sent explicitly (fixed as above): without `type` Bonita may guess `Integer` and the `Long` correlation silently fails to match. Success is `204`.
- `resolvedBy` is the issue assignee's `displayName`, or `"Onbekend"` when unassigned.
- The message name (`BONITA_MESSAGE_ACCESS`) and target process (`BONITA_ONBOARDING_PROCESS`) are configurable. Show a small "Ofelia notified" chip on the card once Bonita returns `2xx`; a red chip on error.

**Bonita disabled mode**: if `BONITA_ENABLED=false`, skip all callbacks, show `Ofelia niet verbonden` in the header, and still update local state. This allows building and testing the screens without Bonita.

## 6. Screens

Five routes, all in Dutch, all readable on a 1920×1080 projector and also when four screens are tiled on one display (minimum 900×500 each). Every screen has: a header with the system name + `Gesimuleerd` badge, a green/grey live dot (SSE connected), and a toast area. New or changed items **flash** (yellow background fading over 2 s) and slide in at the top.

### 6.1 `/ui/topdesk` – "ITSM · TOPdesk API (gesimuleerd)"

- **Left: Meldingen** – table of incidents, newest first: Nummer, Korte omschrijving, Aanmelder, Categorie, Status, Extern nummer. Click a row to open a side panel with the full request and the actions timeline (newest first, with author and time).
- **Tab: Wijzigingen** – same table for operatorChanges with a status pill mapped from `processingStatus` (`simple_notStarted` → `Aangemeld` grey, `simple_inProgress` → `In behandeling` blue, `simple_done`/`simple_closed` → `Afgerond` green). Each change has buttons `In behandeling` and `Afronden`, which call `POST /tas/api/operatorChanges/{id}/processingStatusTransitions` (`start` / `implement`) as Bonita would (the demo uses these to show Servicedesk progress).
- **Button: Nieuwe aanvraag indiensttreding** – opens a form with the onboarding fields from section 5 (pre-filled with Sanne de Vries; a "Wis" link clears it). Applications are checkboxes (SAP, Zaaksysteem, Decos, GIS-viewer). Submit calls `POST /admin/topdesk/onboarding`. On success: toast "Ofelia-proces gestart – case {caseId}".
- **Persons tab** – list with an `Gearchiveerd` badge for archived persons (shows offboarding).

### 6.2 `/ui/entra` – "Identiteiten · Microsoft Graph API (gesimuleerd)"

- **Users table**: initials avatar, Weergavenaam, UPN, Functie, Afdeling, Manager, Licenties (chips), Status (`Actief` green / `Uitgeschakeld` red).
- Click a user: side panel with groups (from `memberOf`), licences, manager, hire date, "Sessies ingetrokken" timestamp if set, and an **audit list** of every Graph call that touched this user (method, path, time), taken from the request log (Graph paths containing the user's id or UPN; current run only).
- A disabled user stays visible, greyed out, with a red badge. This is the offboarding proof moment.
- **Groups tab**: groups with member count; expand to see members; new members flash.

### 6.3 `/ui/jira` – "Jira · REST API v3 (gesimuleerd)"

- Project switcher (`IAM`, `AUTO`).
- **Board** with three columns: To Do, In Progress, Done. Card: key, summary, assignee initials, due date (red if past), labels as chips, issue type icon (Task / Epic).
- Card actions: drag between columns OR buttons `Start` / `Klaar`. Moving to Done calls the same code path as the transitions API (fires callback B).
- Click a card: modal with rendered description (ADF), comments, and the `Ofelia notified` chip state.

### 6.4 `/ui/teams` – "Teams · Workflows webhook (gesimuleerd)"

- **Left rail**: channel list with unread counters.
- **Main area**: message feed of the selected channel, newest at the bottom, auto-scroll. Each message shows sender "Ofelia Workflow", time, and the Adaptive Card rendered with the `adaptivecards` library (support TextBlock, FactSet, ColumnSet, Image, Container, Action.OpenUrl). `Action.OpenUrl` opens the URL in a new tab.
- A card whose first TextBlock starts with ⚠️ or that contains a Container with `style: "attention"` gets a red left border (escalation).
- "Alle kanalen" toggle shows every channel in one feed, for the overview layout.
- MessageCard and plain text payloads render as simple cards.

### 6.5 `/ui/overview` – presenter layout

- 2×2 grid of the four screens as iframes in compact mode (`/ui/jira?compact=1` etc.), plus a thin bottom bar showing the last 5 API calls received (`POST /v1.0/users 201 · 12 ms`). This is the screen shown next to Bonita during the demo.
- Keyboard: `R` asks for confirmation then calls `/admin/reset`; `1`–`4` maximise a quadrant (CSS only, iframes stay loaded); `Esc` returns to the grid.

### 6.6 Design rules

- Neutral design system, not a copy of any vendor's UI: white surfaces, grey borders, one accent colour per screen (TOPdesk teal `#0E7C7B`, Entra blue `#2563EB`, Jira indigo `#4F46E5`, Teams purple `#6D28D9`). No vendor logos; use a simple line icon (lucide-react).
- Font: Inter or system sans-serif; minimum 14 px body, 20 px headings on projector.
- Dates in Dutch format (`01-12-2026 09:00`), Dutch labels everywhere, English kept only for API names.
- Light mode only (projector contrast).

## 7. Live updates, reset and configuration

**SSE stream** – `GET /events` sends one event per state change:

```
event: change
data: {"system":"graph","entity":"user","action":"created","id":"…","summary":"Sanne de Vries aangemaakt","at":"2026-12-01T09:00:12Z"}
```

- `system`: `topdesk` | `graph` | `jira` | `teams` | `admin`. `action`: `created` | `updated` | `deleted` | `reset` | `callback_ok` | `callback_error`.
- Send a heartbeat comment every 15 s. Screens reconnect automatically (EventSource default) and refetch their data on reconnect and on `reset`.
- Screens read all data from `GET /admin/state`. On any `change` event for their system they refetch it, diff against the previous state and flash new/changed items; the event `summary` feeds the toast.
- Screen actions (Jira `Start`/`Klaar`, TOPdesk change buttons) call the same mock API routes as Bonita, with header `X-Mock-Source: ui`. Such requests skip `RESPONSE_DELAY_MS`, `FAIL_RATE` and the request log, but run the same code (callback B still fires).

**Reset** – `POST /admin/reset` reloads `seed/*.json`, resets number counters (incidents `I 2610 009`, changes `C 2610 004`, Jira `IAM-105`, `AUTO-105`), clears the request log and broadcasts `reset`. The seed also loads on every start (state is in memory only).

**Configuration (environment variables)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `BONITA_ENABLED` | `true` | Turn callbacks on/off |
| `BONITA_URL` | `http://bonita:8080/bonita` | Bonita base URL |
| `BONITA_USER` / `BONITA_PASSWORD` | `walter.bates` / `bpm` | Technical user for callbacks |
| `BONITA_ONBOARDING_PROCESS` | `MedewerkerOnboarding` | Process name to instantiate |
| `BONITA_MESSAGE_ACCESS` | `accessGranted` | Message name for callback B |
| `RESPONSE_DELAY_MS` | `150` | Artificial latency so calls feel real; `0` in tests |
| `FAIL_RATE` | `0` | Optional random 5xx rate (0–1) on mock API routes only (never `/admin`, `/events`, `/ui` or `X-Mock-Source: ui`) |
| `TENANT_ID` | `demo-amsterdam` | Accepted tenant in the token URL (any value accepted, logged) |

## 8. Docker setup

Multi-stage `Dockerfile`: stage 1 builds the React screens with Vite, stage 2 compiles the TypeScript server, stage 3 is `node:20-alpine` with only production dependencies, running as a non-root user, with a `HEALTHCHECK` on `/health`. Target image size under 200 MB.

`docker-compose.yml` (the Bonita service is provided by the presenter; keep it as a commented example):

```yaml
services:
  mock-suite:
    build: .
    image: ofelia/mock-suite:0.1.0
    ports: ["8090:8080"]
    environment:
      BONITA_ENABLED: "true"
      BONITA_URL: http://bonita:8080/bonita
      # Bonita running on the host (Studio/Tomcat), not in compose:
      # BONITA_URL: http://host.docker.internal:8080/bonita
      BONITA_USER: walter.bates
      BONITA_PASSWORD: bpm
      RESPONSE_DELAY_MS: "150"
    volumes:
      - ./seed:/app/seed:ro
      - ./config:/app/config:ro
    networks: [demo]

  # bonita:
  #   image: <presenter's Bonita image, pinned version>
  #   ports: ["8080:8080"]
  #   networks: [demo]

networks:
  demo: {}
```

Bonita connectors use `http://mock-suite:8080` inside the network, or `http://localhost:8090` when Bonita runs on the host (README covers both); the presenter's browser uses `http://localhost:8090/ui/overview`. Pin all dependency versions in `package-lock.json`.

## 9. Testing and acceptance criteria

**Automated tests (must pass in `npm test`; no CI in v0.1)**

- One API test per route in section 4: happy path, plus missing required field (`400`), unknown id (`404`) and missing auth header (`401`) wherever the route can produce that status.
- A Bonita stub (a tiny Fastify server in the test) to verify callbacks A and B: login, process lookup, instantiation body, message body, retry after `401`, error handling when Bonita returns `500`.
- Reset test: create data, call reset, state equals seed.
- Playwright smoke test per screen: loads, shows seed data, shows a new item within 1 s after the matching API call.

**Scripted end-to-end check** – `scripts/demo-run.sh` uses curl to replay the full demo sequence against the mock (with `BONITA_ENABLED=false`), pausing 2 s between calls so a person can watch the screens:

1. Token, then `POST /v1.0/users` (Sanne de Vries), manager `$ref`, two group memberships, licence.
2. `POST /tas/api/operatorChanges` (laptop), then `PATCH` to `In behandeling` and `Afgerond`.
3. Two `POST /rest/api/3/issue` (SAP, Zaaksysteem), one transition to Done.
4. `POST /teams/hook/facilities` with the escalation card from section 4.5.
5. Offboarding: `PATCH` user `accountEnabled:false`, `revokeSignInSessions`, `DELETE` group membership, `PATCH` person archive.

**Acceptance checklist (presenter signs off)**

- [ ] `docker compose up` on a clean machine works offline in under 2 minutes.
- [ ] Every call in section 4 returns the documented status and shape.
- [ ] Each effect appears on its screen in under 1 s, with the flash highlight.
- [ ] TOPdesk form starts a real Bonita case; caseId appears in the incident.
- [ ] Jira "Klaar" moves the Bonita process forward.
- [ ] Escalation card shows a red border in the Teams screen.
- [ ] Disabled user shows red in the Entra screen with its audit list.
- [ ] Reset returns all screens to the seed state.
- [ ] Overview layout is readable when projected at 1920×1080.
- [ ] No vendor logos; `Gesimuleerd` is visible on every screen.

## 10. Build order and scope

Work in this order and commit after each milestone. Do not start a milestone before the previous one's tests pass.

1. **Skeleton** – Fastify server, store with persistence and reset, seed files, `/health`, `/admin/*`, SSE, Dockerfile, compose. Test: reset and SSE.
2. **Graph API + Entra screen** – routes 4.1 and 4.3, users/groups screen with live flash. Test: API tests + screen smoke test.
3. **TOPdesk API + screen** – routes 4.2, incidents/changes/persons tabs, onboarding form with `BONITA_ENABLED=false`.
4. **Jira API + board** – routes 4.4, board, drag/buttons, ADF rendering.
5. **Teams webhook + feed** – route 4.5, Adaptive Card rendering, escalation style.
6. **Bonita callbacks** – `bonita.ts`, callbacks A and B, configurable contract, error toasts. Test with the Bonita stub.
7. **Overview layout + request log bar + keyboard shortcuts.**
8. **Polish** – `scripts/demo-run.sh`, README (start, reset, connect Bonita, change contract), acceptance checklist run.

**Out of scope**

- Real authentication, OAuth flows, permissions or multi-tenancy.
- Full API coverage: only the routes listed in section 4.
- Pagination beyond `page_size` / `$top` truncation.
- Interactive Teams card actions (`Action.Submit`); only `Action.OpenUrl`.
- Any Bonita process, BDM or connector work: the Bonita side is built separately.
- Mobile layouts and dark mode.
- A screen for the AI request-routing process ("Verzoek routeren"); routing results already show as `operatorGroup` changes on TOPdesk incidents.

**Open questions for the presenter**

- Final contract name and fields of the Bonita onboarding process. Non-blocking: build against the section 5 defaults; a change is a `config/bonita-contract.json` edit.
