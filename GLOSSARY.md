# Mock Suite

Stand-in for TOPdesk, Microsoft Entra ID, Jira Cloud and Microsoft Teams, so an Ofelia onboarding demo for Gemeente Amsterdam runs without access to any of the real products.

## Language

**Ofelia**:
The name the demo uses for the Bonita platform that runs the onboarding process. Bonita appears only in technical contexts (API paths, config).
_Avoid_: BPM engine, workflow tool

**Case**:
One running instance of the Ofelia onboarding process for one new hire, identified by its `caseId`.
_Avoid_: process instance, workflow, ticket

**Simulated system**:
One of the four products the mock suite imitates (TOPdesk, Entra, Jira, Teams).
_Avoid_: mock, fake, stub (a stub is a test double, see below)

**Screen**:
The live web view of one simulated system's state, watched by the audience.
_Avoid_: dashboard, page, UI

**Overview**:
The presenter layout that tiles the four screens with the recent-calls bar.
_Avoid_: dashboard, home

**Callback**:
A call the mock suite makes *into* Ofelia. There are exactly two: starting a case from the TOPdesk form, and signalling that a Jira issue is Done.
_Avoid_: webhook (webhook means Teams' incoming hook), notification

**Case label**:
The Jira label `case-{caseId}` that ties an issue to a case. Only issues with it trigger a callback.

**Escalation**:
A Teams message posted by Ofelia when a human task goes overdue; the Teams screen marks it with a red border. The mock suite only displays it, it never decides that something is overdue.
_Avoid_: alert, overdue notification

**Seed**:
The fixed fictional starting data that every reset restores.
_Avoid_: fixtures, demo data

**Reset**:
Putting every simulated system back to the seed and clearing the event and request logs.

**Gesimuleerd**:
The badge on every screen stating it is a simulation, not the real product.

**Bonita stub**:
A tiny fake Ofelia server used only in tests to verify callbacks.
