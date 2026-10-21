---
name: make-lesson-dynamic
description: Instructional design techniques for making training lessons more engaging and sticky. Use when asked to add dynamic elements, make a lesson more interactive, improve engagement, or enhance retention in a training slide or chapter.
---

# Make Lesson Dynamic

Encodes 8 instructional design techniques for transforming passive training slides into active learning experiences. Apply these when asked to make a lesson, chapter, or slide more engaging, dynamic, or interactive.

## When to Use This Skill

Invoke when the user asks to:
- "Make this lesson more dynamic / engaging / interactive"
- "Add exercises to this chapter"
- "Improve retention for this section"
- "Make this slide less boring"
- "Add activities or checks"

## The 8 Techniques

### 1. Scenario-Based Questions (over pure recall)

**What:** Replace factual recall questions with applied scenarios that force learners to use knowledge in context.

**Instead of:** "What is the minimum RAM requirement?"
**Use:** "Your Bonita server handles 200 concurrent users and complex connectors — would 4 GB RAM be sufficient? Why?"

**When to apply:** After any slide that lists specs, requirements, or configuration values. Especially effective after system sizing, architecture, and configuration slides.

**Implementation:** Add a "Check Your Understanding" slide immediately after the content slide. Frame as a realistic situation the learner might face on the job.

---

### 2. Error-Spotting Exercises

**What:** Show a deliberately broken configuration, diagram, or command and ask learners to identify what's wrong.

**Example:** Show a `database.properties` file pointing at H2 in a "production setup" context. Ask: "What's wrong with this configuration?"

**When to apply:** After any configuration or setup section. High-value for: database configuration, security settings, cluster setup, LDAP/OIDC parameters. Mirrors actual admin troubleshooting work — high engagement.

**Implementation:** Create a "Spot the Error" slide with the broken config highlighted in a code block. Reveal the answer on the next slide or via a click animation.

---

### 3. Progressive Disclosure ("reveal on click")

**What:** Show a diagram with blank labels or a flowchart step-by-step rather than all at once. Keeps learner attention engaged as the picture builds.

**When to apply:** Architecture diagrams, multi-step processes, decision flows, any diagram with 5+ labeled components.

**Implementation in reveal.js:** Use `data-fragment-index` on each label or step so they appear sequentially on advance. In markdown chapters, stage across consecutive slides with incremental content.

---

### 4. Reflection Prompts

**What:** Short open-ended pauses that ask learners to connect content to their own context before moving on.

**Example:** "Before the next section — which installation method would suit your organization, and why?"

**When to apply:** At natural section boundaries, especially before introducing trade-offs or decision points. Low cost to add, high impact on retention because learners actively link content to their real situation.

**Implementation:** A single-sentence prompt slide with no answer required. Can also be a facilitator note for in-person delivery ("Pause here and ask the room").

---

### 5. Decision Trees (instead of comparison tables)

**What:** Replace "Table A vs Table B" comparisons with a branching flowchart that leads learners to the right answer for their situation.

**Example instead of a Bundle vs Docker table:**
```
Do you run containerized workloads?
  → Yes → Docker deployment
  → No → Do you have a dedicated ops team?
       → Yes → Bundle on bare metal
       → No → Bundle on a VM (simpler ops)
```

**When to apply:** Any slide with a comparison table between 2–4 options where the "right" answer depends on context. Technology selection, deployment topology, authentication method choice.

**Implementation:** Mermaid flowchart in markdown, or a reveal.js slide with fragment-animated branches.

---

### 6. Worked "Setup Walkthroughs" with Intentional Mistakes

**What:** Live or recorded demo of a full setup sequence with one or two deliberate mistakes introduced mid-way. Learners spot and fix the errors.

**When to apply:** Any multi-step procedural section (installation, cluster setup, LDAP sync configuration). Much stickier than step-by-step slides for procedural content.

**Implementation:** Prepare a companion demo script or screen recording. Mark the intentional error moments. For async use, add a "Did you spot the mistake?" pause slide after the error moment before revealing it.

---

### 7. Chunking with Explicit Progress Signposting

**What:** Add a visible chapter roadmap at the start of each major section, plus a brief "What we covered / What's next" slide at each section boundary.

**Example roadmap:** "In this chapter: Installation → Configuration → Validation → Troubleshooting. You are here: Installation."

**When to apply:** Every chapter with more than 4 major topics. Non-negotiable for chapters over 20 slides.

**Implementation:** Add a `section-intro` slide at the start of each chapter and a `section-outro` slide at the end. Keep them templated so they're fast to produce and visually consistent.

---

### 8. Reference Cards as Takeaways

**What:** A one-page printable cheat sheet covering: key files, key commands, default credentials (where applicable), common gotchas, the pull/push or deploy workflow.

**When to apply:** At the end of any chapter that covers a complete workflow (installation, LDAP sync, OIDC config, CI/CD pipeline). Learners value it immediately and it reinforces the mental model long after the session.

**Implementation:** A dedicated `reference-card.md` or an appendix slide in the chapter. Include: file paths, commands, config keys, and a 2-line summary of the "happy path" for the chapter's main task.

---

## How to Apply

When asked to make a lesson dynamic, do the following:

1. **Read the target chapter or slide set** to understand its current content and structure.
2. **Identify which techniques fit** based on the content type:
   - Configuration/specs → Techniques 1, 2
   - Diagrams/architecture → Techniques 3, 5
   - Section boundaries → Techniques 4, 7
   - Procedural steps → Techniques 6
   - End of chapter → Techniques 7, 8
3. **Propose additions** as concrete slide insertions or content changes, not abstract recommendations.
4. **Prioritize** by learner value: error-spotting and scenario questions first (highest engagement), reference cards last (but always include for procedural chapters).

When proposing additions, always name:
- Where in the lesson it goes (after which slide / at what boundary)
- What the learner does (not just what is shown)
- The specific content or a concrete draft
