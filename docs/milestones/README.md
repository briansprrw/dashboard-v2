# Dash2 Milestone Control Center

This directory turns the Dash2 product, architecture, and implementation proposals into controlled execution packets for Claude, Codex, and Brian.

## Governance

- **Brian is product owner and final approver.** He approves scope, unresolved product/architecture decisions, destructive actions, production changes, launch, and V1 retirement.
- **Claude is implementation lead.** Claude investigates and implements one approved work packet at a time and supplies evidence. Claude may set a milestone no higher than `Ready for PM/QA`.
- **Codex is analyst/PM/QA.** Codex clarifies requirements, checks scope and evidence, performs independent review/testing, and recommends accept or changes requested. Codex does not silently expand implementation scope.

No agent reviews its own work as the only gate. A passing test suite is required evidence, not the entire acceptance decision.

## Run milestone stages

Claude and Codex load their role-specific root instructions and share the [Milestone Command Runbook](../prompts/milestone-command-runbook.md). Use:

```text
Run M0 Readiness
Run M1 Implementation
Run M1 QA
Run M1 Re-review
```

Codex owns Readiness, QA, and Re-review. Claude owns Implementation. Brian owns final milestone acceptance.

## Status dashboard


| ID | Milestone                                                                            | Status      | Primary Claude                                                           | Required review                                         | Exit approval |
| -- | ------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| M0 | [Product and architecture decisions](./M0-product-and-architecture-decisions.md)     | Accepted    | Complete (Opus 4.8 `xhigh`)                                              | Codex + Brian (Complete)                                | Brian (Approved 2026-07-23) |
| M1 | [Foundation and delivery](./M1-foundation-and-delivery.md)                           | Ready for PM/QA | Sonnet 5 `high` +think                                                   | Sonnet 5 `high` +think + Codex                          | Brian         |
| M2 | [Domain, authentication, and authorization](./M2-domain-auth-and-authorization.md)   | Not Started | Opus 4.8`xhigh`                                                          | separate Opus 4.8`xhigh` + Codex                        | Brian         |
| M3 | [Glance dashboard and core tasks](./M3-glance-dashboard-and-core-tasks.md)           | Not Started | Sonnet 5`high`                                                           | Sonnet 5`high` +think + Codex visual/functional QA      | Brian         |
| M4 | [Management, sharing, and admin](./M4-management-sharing-and-admin.md)               | Not Started | Sonnet 5`high`                                                           | Opus 4.8`xhigh` permission review + Codex               | Brian         |
| M5 | [Public dashboards and display access](./M5-public-dashboards-and-display-access.md) | Not Started | Sonnet 5`high`                                                           | Opus 4.8`xhigh` privacy review + Codex                  | Brian         |
| M6 | [Migration and reconciliation](./M6-migration-and-reconciliation.md)                 | Not Started | Sonnet 5`high` +think (Fable 5 `high` fallback if a rehearsal runs long) | Opus 4.8`xhigh` + Codex                                 | Brian         |
| M7 | [Hardening and device QA](./M7-hardening-and-device-qa.md)                           | Not Started | Sonnet 5`high` +think                                                    | Sonnet 5`high` +think + Codex; targeted human device QA | Brian         |
| M8 | [Production launch](./M8-production-launch.md)                                       | Not Started | Sonnet 5`high` +think as runbook assistant                               | Codex + Brian at every production gate                  | Brian         |
| M9 | [Validation and V1 retirement](./M9-validation-and-v1-retirement.md)                 | Not Started | Sonnet 5`high`                                                           | Opus 4.8`high` + Codex                                  | Brian         |

Update this dashboard only after the corresponding milestone document records the same status and evidence.

## Sequence and overlap

```text
M0 decisions
    ↓
M1 foundation
    ↓
M2 domain/auth
    ↓
M3 glance/core tasks
    ↓
M4 management ──→ M5 public (only if launch-approved)
    ↓                    ↓
M6 migration tooling and two clean rehearsals
    ↓
M7 hardening/device QA
    ↓
M8 production launch
    ↓
M9 validation and V1 retirement decision
```

M6 synthetic-fixture design may begin after M0. Read-only V1 source profiling may begin only during M6 and only with Brian's separate authorization. Import implementation must wait until the destination schema is stable. No production source access or write freeze is implied by that overlap.

M5 may be deferred after M4 if public dashboards are not in launch scope. Record that decision; do not leave the milestone ambiguously incomplete.

## Model-routing rationale

The default implementation and review model is **Claude Sonnet 5 at `high` effort**: it offers the best speed/intelligence balance for scoped coding, test iteration, and routine review. Reserve **Claude Opus 4.8 at `xhigh`** for milestones where a wrong answer could reshape the architecture, break authorization, expose private data, or corrupt migration (M0, M2 both roles; M4/M5 review; M6/M9 review). **Claude Fable 5 at `high`** is not a default anywhere on this dashboard; it is only a documented fallback for M6 if a specific migration rehearsal genuinely needs a long autonomous session — do not invoke it for ordinary work packets. **Claude Haiku 4.5** is allowed for mechanical, easily checked inventory only and has no effort control.

### `+think` notation

`+think` marks a cell where extended thinking must be explicitly enabled for that pass, because the milestone's work is harder than typical Sonnet `high` work but does not rise to an architecture/authorization/privacy/migration risk that would justify Opus `xhigh`. Opus at `xhigh` already reasons at its deepest setting, so it is never written with `+think`. Enable extended thinking through whatever mechanism the active Claude Code version exposes for it (for example a `/think` or thinking-budget toggle, or the "think"/"think hard" phrasing in the prompt) — confirm the exact control in the current Claude Code version at the time of the session, since this guide does not track that surface, and record what was actually used in the handoff.

`max` is an escalation for a bounded, unresolved critical problem. It is not a milestone default and never replaces independent review. Record the actual resolved model/version in every handoff because Claude Code aliases can update or vary by provider.

Recommended commands:

```text
/model sonnet
/effort high
# plus the active Claude Code version's extended-thinking toggle, only for cells marked +think

/model opus
/effort xhigh
```

If a named model is unavailable, Claude must stop before high-risk work and propose a fallback. Brian or Codex must accept the reduced-confidence plan.

Official references: [Claude Code model configuration](https://code.claude.com/docs/en/model-config) and [Anthropic model overview](https://platform.claude.com/docs/en/about-claude/models/overview).

## Gate workflow

1. **PM opens a work packet.** Codex/Brian identifies the milestone, desired outcome, dependencies, scope exclusions, and acceptance criteria.
2. **Claude investigates first.** Claude reads the specified context, checks the worktree, identifies conflicts, and restates the packet before editing.
3. **Claude implements and verifies.** Work stays inside the packet. Tests are added with behavior.
4. **Claude prepares the handoff.** The milestone Evidence Index points to commands/results, screenshots, reports, or diffs. Status becomes `Ready for PM/QA` only when every exit item is addressed.
5. **Codex reviews independently.** Codex checks the diff, reruns appropriate tests, probes denial/failure paths, and records findings by severity.
6. **Claude addresses findings.** Status becomes `Changes Requested` until evidence is refreshed.
7. **Brian decides.** Brian records `Accepted`, defers scope, or requests changes. Only then may the next dependent milestone begin.

## Definition of Ready

A milestone can enter `In Progress` only when:

- Its prerequisites are accepted.
- Blocking product/architecture decisions are recorded.
- In-scope and out-of-scope items are explicit.
- Acceptance criteria are observable and testable.
- Required environments, fixtures, credentials, and human test devices are identified without embedding secrets.
- Rollback/containment is credible for the milestone's risk.
- Primary and review model/effort are agreed.

## Definition of Done

A milestone can be recommended for acceptance only when:

- Every committed deliverable is present or explicitly deferred by Brian.
- Automated checks pass in the current worktree.
- Required manual/device/visual checks have recorded evidence.
- Negative and permission paths are tested where applicable.
- No unresolved P0/P1 defect remains.
- P2/P3 defects are documented with owner/disposition.
- Security, privacy, accessibility, observability, migration, and rollback criteria relevant to the milestone are met.
- Documentation and runbooks match the implemented behavior.
- The final diff contains no secrets, debug artifacts, unrelated changes, or unreviewed generated output.
- Codex has completed an independent PM/QA review.
- Brian has recorded the acceptance decision.

## Required milestone record

Each milestone document contains four live sections:

### Decision Log


| ID | Date | Decision | Owner | Rationale/impact |
| -- | ---- | -------- | ----- | ---------------- |

Only explicit decisions go here. A proposal or Claude inference is not a decision.

### Risk Log


| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
| -- | -------- | ---- | ------------------ | ----- | ------ |

### Evidence Index


| ID | Acceptance criterion | Evidence | Result | Reviewer |
| -- | -------------------- | -------- | ------ | -------- |

Evidence should be reproducible and safe to share. Never paste secrets or private production task content.

### PM/QA Sign-off

```text
Claude status: Not Started
Claude handoff date: —
Codex review: Pending
Open P0/P1: 0
Brian decision: Pending
Decision date: —
Notes: —
```

## Decision-brief format

When blocked, provide one brief rather than scattering questions:

```text
Decision ID and title:
Why it is needed now:
Constraints/evidence:
Option A — consequences:
Option B — consequences:
Recommendation:
Default if deferred (only when safe):
Decision owner:
```

No safe default exists for authorization, privacy, destructive lifecycle, production migration, or launch decisions.

## Defect severity and gate impact


| Severity | Meaning                                                                              | Gate impact                            |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| P0       | Active exposure/loss, auth bypass, production outage, migration corruption           | Stop work/launch; contain and escalate |
| P1       | Core workflow or launch blocker; credible security/reliability/accessibility failure | Milestone cannot pass                  |
| P2       | Important defect with safe workaround or limited impact                              | Requires explicit disposition          |
| P3       | Low-impact polish or deferred improvement                                            | Track; does not normally block         |

## Canonical planning inputs

- [Product plan](../plans/2026-07-22-dash2-product-plan.md)
- [Technical architecture](../plans/2026-07-22-dash2-technical-architecture.md)
- [Implementation proposal](../plans/2026-07-22-dash2-implementation-plan.md)
- [Claude operating guide](../../CLAUDE.md)

These inputs remain proposals until M0 records approval. V1 `Roadmap.md` and `README.md` are reference material, not Dash2 scope.

**Last updated:** 2026-07-23
