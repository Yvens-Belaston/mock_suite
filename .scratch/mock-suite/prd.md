# Mock Suite – Gemeente Amsterdam Demo (PRD)

Status: ready-for-agent
Detailed reference: `.scratch/mock-suite/spec.md` (API tables, payload examples, seed data, config)
Issues: `.scratch/mock-suite/issues/01`–`37`
Terms: see `GLOSSARY.md` (Ofelia, Case, Simulated system, Screen, Overview, Callback, Case label, Escalation, Seed, Reset, Gesimuleerd, Bonita stub)

## In plain words

The presenter has to demo an employee-onboarding process built in Ofelia (our name for the Bonita platform) to Gemeente Amsterdam. The process talks to TOPdesk (service desk), Entra ID (Microsoft's staff directory), Jira (ticket tracker) and Teams (chat), but the presenter has none of them. We build one small service that pretends to be all four, using their real API addresses, and shows what is happening in each one on a live screen.

## What will be different afterwards

- Ofelia's connectors can be pointed at the mock suite for the demo and later at the real systems by changing only URLs and credentials.
- The audience watches four screens (TOPdesk, Entra, Jira, Teams) that update by themselves within 1 second of each call.
- Two screens act back on Ofelia: the TOPdesk form starts an onboarding case, and marking a Jira ticket "Klaar" (Done) moves the case forward.
- The presenter can reset everything to the starting data in under 1 second, and rehearse the whole demo without Ofelia using a script.

## Example

1. The presenter opens the overview screen next to Ofelia.
2. On the TOPdesk screen they click "Nieuwe aanvraag indiensttreding" and submit the form, already filled in with Sanne de Vries.
3. A TOPdesk incident appears; Ofelia starts case 1042 and the incident shows `OFELIA-1042`.
4. Ofelia creates Sanne's Entra account (her row flashes on the Entra screen), adds her to groups, orders a laptop (TOPdesk change) and opens SAP and Zaaksysteem access tickets (Jira board).
5. Noor Hendriks' SAP ticket is clicked "Klaar"; the card shows "Ofelia notified" and the case moves on.
6. The Facilities task goes overdue; Ofelia posts a red-bordered escalation card in the Teams `facilities` channel.
7. Later, offboarding disables Sanne's account: her Entra row turns grey and red, with the list of calls that did it.
8. The presenter presses `R`, confirms, and every screen is back to the start.

## Before / After

| | Before | After |
|---|---|---|
| Demo dependencies | Needs four real tenants nobody has | One `docker compose up`, offline |
| What the audience sees | Only Ofelia | Ofelia plus four live system screens |
| Repeating the demo | Manual clean-up in each system | `R` on the overview |
| Going live later | Rebuild connectors | Change URLs and credentials only |

## Technical details

### Problem Statement

The presenter must show an end-to-end onboarding and offboarding process to a municipality, but has no access to the four systems the process integrates with. Without them, the connectors can't run and the audience can't see any effect outside Ofelia. A fake that returns "OK" isn't enough: connectors built against it must work unchanged against real tenants later, and the effects must be visible and convincing on a projector, clearly labelled as a simulation.

### Solution

One service imitates the four simulated systems at their real API paths, methods, field names and status codes. It keeps the state in memory, starting from fictional Dutch seed data, and pushes every change to five browser screens (one per system plus an overview). It calls into Ofelia at exactly two points: starting a case from the TOPdesk form, and sending a message when a case-labelled Jira issue reaches Done. It can run with Ofelia switched off, for building and rehearsing.

### User Stories

**Presenter: running the demo**
1. As the presenter, I want to start the whole suite with one command on any laptop without internet, so that venue Wi-Fi can't break my demo.
2. As the presenter, I want an overview screen showing all four systems at once, so that I can project it next to Ofelia.
3. As the presenter, I want to press `1`–`4` to enlarge one system and `Esc` to go back, so that I can zoom in on the step I'm explaining.
4. As the presenter, I want to press `R` and confirm to reset everything to the seed, so that I can repeat the demo immediately.
5. As the presenter, I want the reset to finish in under 1 second, so that the audience doesn't wait.
6. As the presenter, I want a bar showing the last 5 API calls received, so that the audience sees real integration traffic.
7. As the presenter, I want to start the onboarding from a pre-filled TOPdesk form, so that the first click of the demo is fast and error-free.
8. As the presenter, I want a "Wis" link to clear the form, so that I can type a different new hire live if asked.
9. As the presenter, I want a toast "Ofelia-proces gestart – case {caseId}" after submitting, so that I can point at the link between both systems.
10. As the presenter, I want a red toast with the HTTP status when Ofelia fails to start the case, so that I can recover calmly instead of guessing.
11. As the presenter, I want to click "Klaar" or drag a Jira card to Done, so that I can play the app owner granting access.
12. As the presenter, I want an "Ofelia notified" chip on the card (green on success, red on error), so that I can prove the case moved forward.
13. As the presenter, I want `In behandeling` and `Afronden` buttons on TOPdesk changes, so that I can play the service desk preparing the laptop.
14. As the presenter, I want the header to show "Ofelia niet verbonden" when Ofelia is switched off, so that I'm never confused about which mode I'm in.
15. As the presenter, I want a script that replays the full demo with pauses, so that I can rehearse and check the screens without Ofelia.
16. As the presenter, I want a README covering start, reset, connecting Ofelia (same network or on my laptop) and changing the contract, so that I can set up without the developer.
17. As the presenter, I want to switch the case-start contract's input and field names in a config file, so that a late change in the Ofelia process doesn't need a code change.
18. As the presenter, I want to optionally slow responses and inject random failures, so that I can show how Ofelia handles latency and errors.

**Audience: watching**
19. As an audience member, I want every screen to say "Gesimuleerd" and avoid vendor logos, so that I'm not misled into thinking these are the real products.
20. As an audience member, I want new or changed items to flash yellow and slide in at the top, so that I notice what just happened.
21. As an audience member, I want each effect to appear within 1 second, so that cause and effect are obvious.
22. As an audience member, I want Dutch labels and Dutch date formats, so that the demo feels like our own environment.
23. As an audience member, I want to read the screens on a projector, even with four tiled on one display, so that I can follow from the back of the room.
24. As an audience member, I want to see the onboarding request as a TOPdesk incident with a timeline of Ofelia's notes, so that I see the service desk stays informed.
25. As an audience member, I want to see the laptop change move Aangemeld → In behandeling → Afgerond, so that I see the physical preparation tracked.
26. As an audience member, I want to see the new account appear in Entra with groups, licences and manager, so that I see access is provisioned automatically.
27. As an audience member, I want to see a disabled account turn grey with a red badge and its sessions revoked, so that I trust offboarding actually cuts access.
28. As an audience member, I want to see every call that touched an account, so that I see there is an audit trail.
29. As an audience member, I want to see archived people marked "Gearchiveerd" in TOPdesk, so that offboarding is visible there too.
30. As an audience member, I want to see access tickets on a Jira board with assignee, due date (red if late) and labels, so that I see app owners get clear work.
31. As an audience member, I want to read a ticket's formatted description and comments, so that I see the tickets are meaningful, not placeholders.
32. As an audience member, I want to see Teams notifications as rendered cards, so that I see how staff are kept informed.
33. As an audience member, I want overdue escalations shown with a red border, so that I see the process doesn't let tasks slip.
34. As an audience member, I want unread counters per channel and an all-channels view, so that I can follow where messages land.

**Process builder: connecting Ofelia**
35. As the process builder, I want each connector to have its own base URL (Graph token and API separately; Teams per channel), so that switching to real tenants changes only configuration.
36. As the process builder, I want the mock to reject what the real APIs reject (e.g. plain-text Jira comments, malformed TOPdesk change updates), so that bugs show up in the demo setup, not at go-live.
37. As the process builder, I want the mock never to require more than the real API, so that a valid real request never fails on the mock.
38. As the process builder, I want a Graph token endpoint that checks the client-credentials fields are present, so that a missing secret or scope is caught early.
39. As the process builder, I want to address Graph users by id or by user principal name everywhere, so that offboarding works with only an email-style name.
40. As the process builder, I want duplicate-account and already-a-member errors in Graph's error format, so that my error handling is tested.
41. As the process builder, I want TOPdesk change updates as JSON Patch with a 204 response, so that my connector matches the real TOPdesk API.
42. As the process builder, I want TOPdesk list searches to return 204 when nothing matches, so that my "not found" branch is exercised.
43. As the process builder, I want Jira transitions to include their target status, so that my connector can pick a transition by status name.
44. As the process builder, I want the mock to send the Jira-Done message with explicit value types, so that the correlation with my case always matches.
45. As the process builder, I want only issues carrying the case label to trigger a callback, so that unrelated tickets don't disturb cases.
46. As the process builder, I want the mock to log in to Ofelia once, reuse the session and retry once after a 401, so that a Bonita restart doesn't break the demo.
47. As the process builder, I want a list of the requests the mock received (with bodies), so that I can debug my connectors.
48. As the process builder, I want Teams to return 404 for an unknown channel (unlike the real webhook), so that a typo in my setup is caught right away.

**Developer: building the suite**
49. As the developer, I want to run everything with Ofelia switched off, so that I can build and test the screens without a Bonita server.
50. As the developer, I want one runnable acceptance check per issue, so that each slice is done when its check passes.
51. As the developer, I want the full state viewable as JSON, so that I can inspect what the screens show.
52. As the developer, I want screen actions to skip the latency, failure injection and request log, so that screens stay snappy and the call bar shows only integration traffic.

### Implementation Decisions

- **One service, one port.** Serves the four simulated APIs, the admin API, the live event stream and the built screens.
- **Store module (deep).** Holds all state in memory; no persistence. Interface: read the whole state, apply an update for one system, reset. Every update appends to an events log and emits a live event. Seed files are loaded per system at start and on reset; number counters (incidents, changes, Jira keys) derive from the seed's highest number, so reset needs no hard-coded counters.
- **Request log.** Last 500 mock-API requests (method, path, body, status, duration, time); cleared on reset. Feeds the overview's call bar and the Entra audit list (Graph paths containing the user's id or user principal name).
- **Mock API routes.** = TOPdesk, Graph (including the token endpoint), Jira v3 and the Teams webhook. Only these get artificial latency and optional failure injection, and only these are logged. Requests marked as coming from a screen skip all three but run the same code.
- **Fidelity rule.** Paths, methods, fields and status codes follow the vendors' published API specs (checked Oct 2026). Be exactly as strict as the real API on input; TOPdesk rejects unknown top-level fields with 400 like the real API; Graph and Jira ignore them. Deliberate exceptions: authentication is accepted, not checked; Teams returns 404 for an unknown channel; TOPdesk incident and change numbers keep a fixed `2610` prefix.
- **Per-system API contracts** (full tables in the reference spec):
  - TOPdesk: incidents (create, get by id or number, update with progress note, filtered list); operator changes (create; update via JSON Patch on processing status and progress trail only; returns 204); persons (search, create, archive). Change status is the real processing-status enum; screens map it to Aangemeld / In behandeling / Afgerond.
  - Graph: token, users (get, filter, create, update, manager, licences, revoke sessions), groups (filter, add or remove members, member-of).
  - Jira v3: myself, user search, create and get issue, comments, transitions. Descriptions and comments must be in Atlassian Document Format (Jira's JSON rich-text format). Transition ids are seed values only; code acts on the target status.
  - Teams: one webhook per channel. Accepts Adaptive Card, legacy MessageCard and plain text; stores the raw payload; returns 202.
- **Live updates.** One Server-Sent Events stream (a one-way push from server to browser). Each screen reloads the full state whenever its system changes, and on reset and reconnect, then compares it with the previous state to decide what flashes. No per-event merge logic.
- **Screens.** One React app with a shared frame (title, accent colour, Gesimuleerd badge, live dot, toasts) and one live-state hook. Overview = four iframes in compact mode; maximise is CSS only. Light mode, Dutch, neutral design, line icons only.
- **Bonita client module (deep).** One function for authenticated calls to Ofelia: logs in once, keeps the session cookie and API token, retries once on 401, treats any 2xx as success. Disabled by configuration, and then callbacks are skipped but local state still updates.
- **Callback A (start case).** The onboarding endpoint creates the incident first, then looks up the enabled process by name and starts it with a contract built from a config map (contract input name, plus form field → contract field; unmapped fields are dropped; no type conversion). The case id may come back as a string or a number. Success: the incident's external number becomes `OFELIA-{caseId}` and a note is added. Failure: the incident is kept, an error note is added, and the screen shows a red toast. Never crashes.
- **Callback B (Jira Done).** One transition function, shared by the API, buttons and drag. When the target is Done and the issue has a case label, it sends the configured message to the configured process. Case id goes as Long and issue key as String, both correlation values; issue key and resolved-by (assignee display name or "Onbekend") go as String message content. The outcome is stored on the issue and pushed live.
- **Escalation.** Ofelia decides an escalation and posts it; the mock suite only displays it. A card counts as an escalation when its first text starts with ⚠️ or its style is `attention`.
- **Configuration.** Environment variables for port, Bonita on/off, URL and credentials, process and message names, latency, failure rate and tenant. No setting for resetting at start: the seed always loads at start.
- **Packaging.** Multi-stage container image under 200 MB, non-root, with a health check. The compose file shows both ways to connect Ofelia (same network, or on the host machine).

### Testing Decisions

- **Good tests check external behaviour only:** status codes, response bodies, what the Bonita stub received, what a browser sees. No tests of internal functions or store internals, so refactoring never breaks tests.
- **Seam 1, HTTP (main).** Start the server in-process, call it over HTTP. Covers every mock API route (happy path, plus 400 / 404 / 401 wherever the route can produce them), admin reset (state equals seed, under 1 s), request log, live event stream, and screen-origin requests being excluded.
- **Seam 2, Bonita stub.** Point the Bonita URL setting at a tiny fake server started inside the test. Assert on what it received: login, process lookup, case-start body built from the contract config, message body with types, re-login after 401, and handling of a 500 (incident kept, error recorded). The code under test needs no test hook for this.
- **Seam 3, browser.** Playwright against the same server, with Ofelia off and latency 0. One smoke test per screen: seed visible, a new item appears within 1 s with the flash after the matching API call, plus each interactive behaviour (buttons, drag, form, escalation border, legacy Teams payloads, overview keys, call bar).
- **Rehearsal script** doubles as an end-to-end check: it must run to completion with every call succeeding.
- **Prior art:** none, as the repo has no code yet. Issue 01 sets the HTTP-test pattern and issue 06 the browser-test pattern; later issues copy them.
- Local `npm test` only; no CI pipeline in v0.1.

### Out of Scope

- Real authentication, OAuth flows, permissions, multi-tenancy.
- API coverage beyond the listed routes; pagination beyond page-size truncation; Jira v2 routes; reading TOPdesk incident actions through the API.
- Interactive Teams card actions (only "open URL" links).
- Persisting state across restarts.
- Any Ofelia-side work (process, data model, connectors).
- A screen for the AI request-routing process ("Verzoek routeren").
- Mobile layouts, dark mode, CI.

### Further Notes

- Open question for the presenter, non-blocking: the final name and fields of the onboarding contract. The section 5 defaults in the reference spec are used until it's confirmed; a change only needs a config edit.
- All seed people are fictional; the new hire Sanne de Vries must not exist in the seed.
- Two API facts come from secondary sources and should be checked once against a real tenant: the exact duplicate-account error text in Graph, and the Teams workflow URL shape.
