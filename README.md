# mock-suite

One Docker service that simulates **TOPdesk**, **Microsoft Entra ID (Graph)**, **Jira Cloud** and **Microsoft Teams**
for the Ofelia (Bonita) demo to Gemeente Amsterdam. Each mock exposes the real API paths and payload shapes, and each
system has a live screen (labelled `Gesimuleerd`) the audience can watch. Full spec: `.scratch/mock-suite/spec.md`.

State lives in memory only. The seed data in `seed/*.json` loads on every start and on every reset.

> **Docker status:** the `Dockerfile` and `docker-compose.yml` are checked by `tests/docker-files.test.ts` as text only.
> No one has built or run the image yet (ticket 38). If `docker compose up` fails, use [Without Docker](#without-docker),
> which is tested.

## 1. Start

```bash
docker compose up --build
```

Then open **http://localhost:8090/ui/overview**: the four screens in a 2×2 grid, with the last 5 API calls in a bar
underneath. The screens are also available one by one:

| Screen | URL |
| --- | --- |
| Overview (presenter layout) | http://localhost:8090/ui/overview |
| TOPdesk | http://localhost:8090/ui/topdesk |
| Entra | http://localhost:8090/ui/entra |
| Jira | http://localhost:8090/ui/jira |
| Teams | http://localhost:8090/ui/teams |

Health check: `curl http://localhost:8090/health` returns `{"status":"ok"}`.

The container listens on port 8080. Compose publishes it on the host as port **8090**.

### Overview keyboard shortcuts

| Key | Effect |
| --- | --- |
| `1` – `4` | Maximise one quadrant (TOPdesk, Entra, Jira, Teams) |
| `Esc` | Back to the grid |
| `R` | Reset the demo (asks for confirmation first) |

### Without Docker

You need Node.js 20 or later.

```bash
npm ci
npm run build:web                            # builds the screens into web/dist (served at /ui/)
BONITA_ENABLED=false PORT=8090 npm run dev   # server with reload; or: npm run build && PORT=8090 npm start
```

Without `PORT` the server listens on 8080, the same port as a local Bonita. Pick 8090 so the URLs in this README work.

## 2. Reset

Reset brings back the seed data, restarts the numbering (`I 2610 009`, `C 2610 004`, `IAM-105`, `AUTO-105`), empties
the request log and tells every screen to reload. Do it before each run-through:

- press `R` on the overview and confirm, or
- call `POST /admin/reset`: `curl -X POST http://localhost:8090/admin/reset` (replies `204`).

Restarting the container also resets everything, because state is never written to disk.

`GET /admin/state` shows the full state as JSON. `GET /admin/requests?limit=50` shows the last API calls, newest first.

## 3. Connect Bonita

The mock calls Bonita in two places:

- **Callback A:** the TOPdesk form "Nieuwe aanvraag indiensttreding" starts the onboarding process.
- **Callback B:** a Jira issue with the label `case-{caseId}` moves to Done, and the mock sends the message `accessGranted`.

Bonita settings are environment variables. Set them in `docker-compose.yml` under `mock-suite.environment`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BONITA_ENABLED` | `true` | `false` skips both callbacks. The screens show `Ofelia niet verbonden` and local state still updates |
| `BONITA_URL` | `http://bonita:8080/bonita` | Bonita base URL, as seen from the mock-suite container |
| `BONITA_USER` / `BONITA_PASSWORD` | `walter.bates` / `bpm` | Technical user the mock logs in with |
| `BONITA_ONBOARDING_PROCESS` | `MedewerkerOnboarding` | Process started by callback A, and target of callback B |
| `BONITA_MESSAGE_ACCESS` | `accessGranted` | Message name for callback B |
| `RESPONSE_DELAY_MS` | `150` | Added latency on mock API calls, so they feel real |
| `FAIL_RATE` | `0` | Share (0–1) of mock API calls that get an empty `503` |
| `TENANT_ID` | `demo-amsterdam` | Expected tenant in the token URL. Any tenant is accepted; the log says whether it matches |
| `PORT` | `8080` | HTTP port inside the container |

A Bonita error never crashes the mock. The TOPdesk screen shows a red toast with the HTTP status, and the Jira card gets a red chip.

The two network directions use different addresses. Pick the case that matches where Bonita runs.

### Bonita in the same compose network

1. Uncomment the `bonita` service in `docker-compose.yml` and put in your Bonita image, with a pinned version.
2. Leave `BONITA_URL: http://bonita:8080/bonita` as it is (the service name `bonita` is its host name).
3. In Bonita, point the connectors at **`http://mock-suite:8080`** (the service name and the container port, not 8090).

### Bonita on your machine (Studio / Tomcat)

1. In `docker-compose.yml`, switch to the commented line `BONITA_URL: http://host.docker.internal:8080/bonita`.
   Docker Desktop (macOS, Windows) knows `host.docker.internal` out of the box. On Linux, also add
   this under the `mock-suite` service:

   ```yaml
   extra_hosts: ["host.docker.internal:host-gateway"]
   ```

2. In Bonita, point the connectors at **`http://localhost:8090`** (the published port).

### Connector base URLs

Every connector has its own base URL. Switching to a real tenant only changes these URLs and the credentials. Paths,
methods, field names and status codes stay the same. The table uses `http://mock-suite:8080`. When Bonita runs on your
machine, use `http://localhost:8090` instead.

| Connector | Demo (mock-suite) | Real tenant |
| --- | --- | --- |
| TOPdesk | `http://mock-suite:8080/tas/api` | `https://<tenant>.topdesk.net/tas/api` |
| Graph token | `http://mock-suite:8080/<tenantId>/oauth2/v2.0/token` | `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token` |
| Graph API | `http://mock-suite:8080/v1.0` | `https://graph.microsoft.com/v1.0` |
| Jira | `http://mock-suite:8080/rest/api/3` | `https://<site>.atlassian.net/rest/api/3` |
| Teams #HR Onboarding | `http://mock-suite:8080/teams/hook/hr-onboarding` | The trigger URL of the channel's Teams Workflow ("When a Teams webhook request is received") |
| Teams #Servicedesk | `http://mock-suite:8080/teams/hook/servicedesk` | Same, for that channel's Workflow |
| Teams #Facilities | `http://mock-suite:8080/teams/hook/facilities` | Same, for that channel's Workflow |
| Teams #Automation CoE | `http://mock-suite:8080/teams/hook/automation-coe` | Same, for that channel's Workflow |
| Teams #Algemeen | `http://mock-suite:8080/teams/hook/algemeen` | Same, for that channel's Workflow |

Credentials in the demo: the mock accepts any value.

- TOPdesk and Jira need an `Authorization: Basic …` header.
- Graph needs `Authorization: Bearer …`, with a token from the token URL (any tenant segment, e.g. `demo-amsterdam.onmicrosoft.com`).
- Teams needs no auth.

An unknown Teams channel returns `404`. A real Workflows trigger would return `202` instead.

## 4. Change the Bonita contract

Callback A sends the form to Bonita under one contract input. The input name and the field names come from
**`config/bonita-contract.json`**:

```json
{
  "inputName": "onboardingInput",
  "fields": {
    "firstName": "firstName",
    "lastName": "lastName",
    "managerEmail": "managerEmail",
    "topdeskIncidentNumber": "topdeskIncidentNumber"
  }
}
```

(The actual file lists all form fields. The excerpt above leaves some out.)

- `inputName` is the name of the contract input in the Bonita process.
- Each key in `fields` is a form field, and its value is the contract field name in Bonita. To rename a field, change
  the value. To stop sending a field, delete its line. Values are passed through as they are: no type conversion.
- Form fields: `firstName`, `lastName`, `startDate`, `department`, `role`, `location`, `equipmentProfile`, `parking`,
  `applications`, `managerEmail`, plus `topdeskIncidentNumber`, which the mock adds.

The mock reads the file each time it starts a case, so an edit takes effect on the next form submit without a
restart. Compose mounts `./config` into the container (read-only), so edit the file in the repo on your machine.

The process name and the callback B message name are not in this file. They are the environment variables
`BONITA_ONBOARDING_PROCESS` and `BONITA_MESSAGE_ACCESS` (see [Connect Bonita](#3-connect-bonita)).

## 5. Rehearse without Bonita

`scripts/demo-run.sh` replays the Bonita side of the demo with `curl`, one call at a time, so you can watch the screens:

1. Entra: token, Sanne de Vries created, then her manager, groups and licence.
2. TOPdesk: Sanne added as a person, then the laptop change created, started and completed.
3. Jira: the SAP and Zaaksysteem access issues created (label `case-1042`), then SAP moved to Done.
4. Teams: the escalation card posted to #Facilities.
5. Offboarding: the account disabled, sessions revoked, the VPN group removed, then the TOPdesk person archived.

Run it with the mock started with `BONITA_ENABLED=false`. With Compose, that means changing `BONITA_ENABLED` to
`"false"` in `docker-compose.yml`, because a shell variable does not override that value. Then:

```bash
curl -X POST http://localhost:8090/admin/reset   # the script creates Sanne; a second run without reset fails
scripts/demo-run.sh                              # waits 2 s after each call
PAUSE=0 scripts/demo-run.sh                      # no waiting
BASE=http://localhost:8080 scripts/demo-run.sh   # another mock address (default http://localhost:8090)
```

You need `bash`, `curl` and `node` on your machine (`node` reads the JSON replies). The script stops with a non-zero
exit code on the first failed call.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Server with reload (`tsx watch src/server.ts`) |
| `npm run build` | Compiles the server to `dist/` |
| `npm start` | Runs `dist/server.js` |
| `npm run build:web` | Builds the screens to `web/dist/` |
| `npm run dev:web` | Vite dev server for the screens (no proxy to the API) |
| `npm test` | Vitest: API, callbacks, Docker files, `demo-run.sh`, web build |
| `npm run test:ui` | Playwright screen tests (starts its own server on port 8181, or `PLAYWRIGHT_PORT`) |

If `npm run test:ui` says a browser is missing, run `npx playwright install --with-deps chromium` and try again.
