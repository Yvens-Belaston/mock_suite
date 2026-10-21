---
name: bonita-project-factory
description: Generate, review or evolve a complete Bonita project (BDM + processes + connectors + REST API + frontend + tests + CI) with the deterministic generator in this repo. Use when asked to "build a Bonita demo", "generate a Bonita project", "new project/demo for customer X", "audit/review this Bonita project", "add this to the generated project", or when project-spec.yaml, a .bos, or ExpenseFlow/LeaveAdmin/LevelsDemo are mentioned.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Bonita Project Factory

Fastest path from "demo idea" to a Bonita project that builds, passes the audit and imports in
Studio. The generator is **deterministic**: the same spec always produces the same project. Never
write `.proc`, `bom.xml` or poms by hand: **write the spec, the generator does the rest.** This is
what saves tokens: you edit a few hundred lines of YAML instead of generating thousands of lines of
XML.

## Paths (relative to the repo root)

Repo root: `/Users/pro/dev/PS_workspace/bonita_project_ai_generator/bonita-project-generator`.
When the current directory is outside this repo, prefix every path below with it.

| What | Where |
|---|---|
| Engine (CLI) | `generator/src/cli.js` (run from `generator/`) |
| Spec contract | `spec/project-spec.schema.md` |
| Examples that build | `spec/examples/` |
| Rules cheatsheet | `spec/SPEC-CHEATSHEET.md` |
| Engine docs (every command) | `generator/README.md` |

First run on a fresh clone: `cd generator && npm install && npm test`. If `npm test` fails with
`ERR_MODULE_NOT_FOUND`, the dependencies are not installed yet.

Optional sibling repos (same parent folder as this one, or env vars): `bonita-custom-page-toolkit`
(`BONITA_CUSTOM_PAGE_TOOLKIT_PATH`, React page template) and `bonita-audit-toolkit`
(`BONITA_AUDIT_PATH`, audit rules). Without them, the frontend and audit steps are skipped with a
warning; tell the user which repo to clone.

Equivalent MCP tools (`ofelia-ai-agent-mcp` server, when loaded):
`generate_bonita_project`, `validate_bonita_spec`, `audit_bonita_project`, `review_bonita_project`,
`update_bonita_project`, `export_bonita_bos`, `bonita_standards_coverage`.
If they are not available, use the CLI (same result).

## Mode 1. New demo or project

1. **Copy the closest example.** Never start from an empty file:
   - approval flow + dashboard + connector: `project-spec.vacation.example.yaml`
   - two approval levels + subprocess (call activity) + SLA timers (reminder and escalation):
     `project-spec.expense.example.yaml`
   - levels/subprocesses only: `project-spec.subprocess.example.yaml`
   - minimal 2024.1 (oldest version): `project-spec.2024.1.example.yaml`
2. **Set the Bonita version in `project.bonitaVersion` from the start** (`2024.1`, `2024.3`,
   `2026.2`). Pick it once and never change it: it drives the parent version, the `.proc` golden
   templates and the Living App descriptor schema.
3. **Adapt the domain**: entities, fields, process, actors, connector, dashboard queries.
   Identifiers **always in English**; `description` is mandatory everywhere (entity, field, index,
   node, query, connector). Read the cheatsheet before inventing syntax.
4. **Validate in a fast loop** (under 1 s):
   ```bash
   cd generator
   node src/cli.js audit --spec <spec> --out <tmp>     # validate, generate and audit
   ```
   Fix the **errors** (they block) and the warnings too (they lower the audit score).
5. **Generate** where needed:
   ```bash
   node src/cli.js project --spec <spec> --out <dir>                  # folder only
   node src/cli.js project --spec <spec> --out <dir> --bos            # + importable .bos
   node src/cli.js project --spec <spec> --into-studio --overwrite    # straight into the Studio workspace
   ```
6. **Review** before delivering: `node src/cli.js review --project <dir> --spec <spec>`
   (writes `REVIEW.md`: score, gate, prioritized findings). Target: **0 critical, 0 mandatory**.
7. **Real build** (the only proof that it is deliverable):
   ```bash
   cd <dir> && mvn -q -pl app -am -DskipTests install
   ```
   Use `install` (not `package`) when the project has connectors or actor filters: the `.bar` takes
   them from the local repo as runtime fat jars. Expected output:
   `app/target/<app>-0.0.1-local.zip` and `app/target/processes/<Process>--<version>.bar`.

## Mode 2. Review and audit an already generated project

```bash
node src/cli.js review --project <dir> --spec <spec>   # prioritized REVIEW.md + upstream candidates
node src/cli.js audit  --project <dir> --spec <spec>   # AUDIT.md, exit 1 on CRITICAL
node src/cli.js standards                             # coverage/drift vs bonita-audit-toolkit
```
Rules come from `bonita-audit-toolkit` (single source of truth); `standards` shows how many are
covered by generator checks. Findings are tagged by rule ID (`BDM-028`, `BPM-014`, `REST-026`...).

## Mode 3. Evolution (existing project)

Never regenerate over it by hand. Edit the spec and apply the diff:
```bash
node src/cli.js update --spec <newspec> --project <dir> --apply dry        # report only
node src/cli.js update --spec <newspec> --project <dir> --apply additive   # only adds (default)
node src/cli.js update --spec <newspec> --project <dir> --apply overwrite  # also refreshes changed files
```
It never deletes, and files that only exist in the project (hand-written code) are left untouched.

## Delivering the demo

- **`.bos`**: `node src/cli.js bos --project <dir> --spec <spec>`. In Studio: File > Import >
  Bonita project (.bos).
- **First step in Studio, always**: deploy the BDM (it generates the entities and DAO classes).
  Otherwise the process neither validates nor starts.
- `--into-studio` also writes `deploy.sh` / `deploy.bat`; `docs/DEPLOY-RUNBOOK.md` documents the
  bundle deployment (the live run is a manual step).
- Frontend design prompt: the generator writes `design/FRONT-DESIGN-PROMPT.md` + `branding.json`
  (customer palette, or Bonita BPM by default) for Stitch / Claude Design. Set `BONITA_DEMO_LOGO`
  to reference a logo file in it.
- Read the generator's WARN lines before demoing: some say a part is generated but inert (for
  example a connector with no inputs, or persistence that writes nothing). A green build does not
  prove the case works; create one case and check the effect.

## Mail in demos

Any demo that sends mail: install the generic module `ofelia-correo` and use the shared SMTP file
`%USERPROFILE%\.ofelia\mail-smtp.properties` (Gmail + app password; Brevo fails DMARC for `@ofelia.com`).
TEST/REAL mode, recipient aliases (`mail.aliasTo`), brand and the pre-demo check: see
[mail-in-demos.md](mail-in-demos.md).

## Narrated demo video

A narrated video recorded from the real application, regenerable without LLM tokens: script as data (`guion.json`,
one scene per capability, with user, steps and narration), headless Chrome records and assembles to WebM, voice with
`edge-tts` (pip, neural voices such as `es-GT-MartaNeural`; no ffmpeg). Reference implementation and how to adapt
it: `runtime/video/README.md` of `endikafercu/demo-bantrab-bonita`. Write the script once; re-record only the scenes
that changed (`--solo`).

## Golden rules (they save the most repeated iterations)

1. The BDM is the source of truth. No process variables for business data.
2. Documents are ephemeral in Bonita: store only the DMS reference in the BDM.
3. Always `fetch: LAZY` on relations (EAGER is a hard error, BDM-028).
4. Every exclusive gateway needs **one unconditioned outflow** (default flow, BPM-014).
5. Index and unique constraint names: 20 characters max (the generator already shortens UCs).
6. A contract input that maps an entity is named `<entity>Input` (`expenseClaimInput`).
7. A `LIST` query without a declared `countFor...`: the generator derives it (informative warning).
8. Do not declare queries Bonita already generates (`find`, `count`, `findBy<Field>`): the build fails.
9. Dashboard REST API is **read-only**. Writes go through processes.
10. Descriptions localizable EN/ES/FR; identifiers English only.
11. Boundary timer (SLA): `timerKind: boundary` + `attachedTo` + ISO-8601 `trigger` +
    `cancelActivity` (true interrupts the task, false is a reminder). Needs exactly one
    unconditioned outflow.
12. Actors: declare ALL of them in `process.actors[]`. The generator creates one lane per actor and
    task assignment follows its lane, so an undeclared actor sends the task to the first actor's
    inbox (with a warning). The first declared actor is the initiator. Nodes without an actor
    (gateways, scripts, call activities, end events) go to the lane of their first predecessor.
13. Error boundary (connector failure): `type: errorBoundaryEvent` + `attachedTo` + `errorCode`.
    It always interrupts, and the generator marks the host connector with
    `throwErrorEvent="true" namedError="<errorCode>"` so the failure really raises the error.
14. Messages between processes: throw with `endEvent` + `endKind: message` + `messageName` +
    `targetProcess` + `targetElement`; catch with `messageEvent` + `messageKind: boundary` +
    `attachedTo` + the same `messageName`. The `correlation` carries the same `key` on both sides and
    a `value` evaluated in each process's context: that is what makes the message reach THAT case
    and not all of them. Without `correlation` it matches by name only. The catch works without a
    throw in the model (message sent through the REST API). `start` and `intermediate` are not
    generated yet.
15. No implicit merges (BPM-013): when two or more flows reach a node that is not a gateway (task,
    call activity, end or intermediate event, including a boundary event's outflow), the generator
    inserts an exclusive merge gateway `Merge<Target>` right before it, in the target's lane, with
    its label hidden (BPM-010). **Do not declare merge gateways in the spec**; the `BPM-013` WARN
    lines list the ones added. The project audit flags an implicit merge left in a hand-edited `.proc`.

16. Descriptions of pools and flow nodes: 255 characters max (BPM-106). The engine persists them in a
    255-character column; a longer one builds, deploys and passes every static check, then the node
    fails at run time and the case gets stuck. The validator rejects it.

17. Startable processes: only a process that no call activity targets gets an initiator actor, so
    users see in "processes I can start" (`bpm/process?f=user_id=`) only the real entry points, never
    the subprocesses. Override with `startable: true|false` on the process.

18. Search keys (`searchKeys`, Bonita case search indexes, max 5): label the case with what people search
    by (management number, ID number, customer, center) and relate every subprocess instance to its root
    case with the same key. They are NOT storage: business data stays in the BDM. Values are Groovy over
    the contract inputs and engine constants, evaluated when the case starts.

19. Diagrams are laid out by `src/process/layout.js`: shapes centred on a grid, every flow routed
    orthogonally through free corridors (explicit GMF RelativeBendpoints), loops back over the top of
    the target, call activities with their name label (5093). Do not hand-place shapes in the spec.
    Opening the project in Studio re-serializes the `.proc` files (namespace order, line feeds): that
    diff is noise, stash it.

20. A green build proves nothing about the paths. For every branch (approve, return, reject, loop
    limits, escalations, timer deadlines, connector failure and its review task) run a runtime path
    test that reaches the final status of the ROOT case. Bonita 2026.2 REST, for those tests and for
    custom pages: process and human task searches need `f=user_id=<uid>` (403 otherwise), and a task
    execution must send every contract input, `null` when it does not apply.

21. Operations on primitive process variables: the operand `returnType` must be the variable class
    (Boolean variable, Boolean script). A String script assigned to a Boolean builds fine and fails
    when the task completes ("Incompatible assignment operation type"); keep a static verifier for it.

## Learnings

If a new Bonita gotcha shows up during generation (version, `.proc`, Studio, Maven) and the
`propose_learning` tool of the Bonita AI Agent MCP is available, propose it, anonymized (no
customer names).
