# Dash2 Milestone Command Runbook

This is the shared milestone command protocol for Claude and Codex. The root `CLAUDE.md` and `AGENTS.md` files route milestone commands here.

For Claude, the installed milestone skills implement the repeatable execution procedures. This runbook defines command grammar, role ownership, project routing, required outcomes, and the Codex review procedures.

For Codex, this runbook remains the complete procedure for Readiness, QA, and Re-review unless equivalent Codex skills are installed and explicitly routed by `AGENTS.md`.

No prompt copying or milestone-variable editing is required. Start a fresh task in the appropriate tool and use commands such as:

```text
M0 Readiness
M1 Implementation
M1 QA
M1 Re-review
```

Natural variants are accepted:

```text
Run the M0 Readiness checks
Run M1 Implementation
Implement M1
Review M1 for QA
Re-review M1 after Claude's fixes
```

## Authority and precedence

This runbook does not override:

1. Brian's latest explicit instruction.
2. Recorded decisions in the active milestone.
3. Approved product and architecture decisions.
4. The active milestone document.
5. Canonical plans referenced by the milestone.
6. The applicable root instruction file.
7. This runbook.

A skill invocation does not grant broader authority than the repository instructions and active milestone allow.

Brian is the product owner and the only final milestone approver. Neither Claude nor Codex may:

- Mark a milestone `Accepted`.
- Approve its own implementation.
- Begin a dependent milestone without authorization.
- Infer permission to commit, push, open or merge a pull request, deploy, migrate, change production, or perform a destructive action.
- Treat a proposal, unchecked plan item, mockup, agent summary, passing test, or existing code as product approval.

## Command grammar

The primary milestone command grammar is:

```text
<Milestone ID> <Stage>
```

`Run` is optional.

### Milestone ID

Use `M0` through the highest milestone defined in `docs/milestones/README.md`.

Resolve the milestone from the current command. Never infer a different milestone from recent conversation or the currently active worktree.

### Primary stages

| Canonical stage | Accepted variants | Owner |
| --- | --- | --- |
| `Readiness` | readiness checks, PM review, plan review | Codex |
| `Implementation` | implement, execution, continue implementation | Claude |
| `QA` | review, gate review, independent review | Codex |
| `Re-review` | remediation review, review after fixes | Codex |

### Claude operational commands

These are not independent milestone gates:

| Command | Purpose | Required Claude skill |
| --- | --- | --- |
| `M# Verification` | Claude self-verification of implementation evidence | `verify-implementation` |
| `Address M# review findings <IDs>` | Correct selected Codex findings | `address-review` |
| `M# Decision: <topic>` | Prepare a blocked decision brief | `decision-brief` |
| `Commit M#` | Create one authorized local commit | Direct `/commit-milestone M#` invocation |
| A production or external mutation request | Establish a separate safety gate | `production-mutation-gate` |

If a command does not identify exactly one milestone and stage or operation, ask only for the missing value. Do not infer it from conversational recency.

## Stage ownership

| Stage or operation | Primary role | Maximum result |
| --- | --- | --- |
| Readiness | Codex as analyst and PM | Readiness recommendation |
| Implementation | Claude as implementation lead | `Ready for PM/QA`, `Partial`, or `Blocked` |
| Verification | Claude self-check | Verification result, not QA approval |
| Correction | Claude implementation lead | `Ready for re-review`, `Partial`, or `Blocked` |
| QA | Codex as independent reviewer | Gate recommendation |
| Re-review | Codex as independent reviewer | Updated gate recommendation |
| Decision brief | Claude or Codex, read-only | Decision request for Brian |
| Commit | Claude after explicit command | One local commit |
| Production mutation gate | Claude, gate only | Authorization status for one exact action |

If Claude receives Readiness, QA, or Re-review, it must identify that the independent stage belongs to Codex and stop unless Brian explicitly changes the role assignment.

If Codex receives Implementation, Correction, Verification, Commit, or a production mutation request, it must identify that the action belongs to Claude and stop unless Brian explicitly changes the role assignment.

## Claude skill routing

Claude must use the installed skills for Claude-owned milestone procedures. It must not imitate or manually recreate a skill workflow when the required skill is available.

### Natural-language routing

| Brian's request | Claude action |
| --- | --- |
| `M# Implementation`, `Run M# Implementation`, `Implement M#`, or equivalent | Invoke `milestone-implement` with the milestone ID and any stated packet or scope. |
| `Continue M# Implementation` | Invoke `milestone-implement` with the milestone ID. The skill resolves the next approved packet independently. |
| `M# Verification`, `Verify M# Implementation`, or equivalent | Invoke `verify-implementation` with the milestone ID and any stated scope. |
| `Address M# review findings P1-01 P2-03` | Invoke `address-review` with the milestone ID and the exact finding IDs. |
| `Address all M# review findings` | Invoke `address-review` with `all` only because Brian explicitly said all. |
| A material unresolved decision blocks work | Invoke `decision-brief` with the milestone ID and decision ID or topic. |
| A deployment, migration, destructive action, DNS or OAuth change, production configuration change, or other external mutation | Invoke `production-mutation-gate` with the exact action and non-secret target. |
| `Commit M#` | Instruct Brian to invoke `/commit-milestone M#` directly. Do not substitute ordinary Git commands. |

If a required skill is missing, unavailable to model invocation, denied by permissions, or fails to load, Claude must stop as `Blocked` and name the missing capability. It must not fall back to an abbreviated improvised procedure.

### Workflow and foundation skills

The workflow skills compose these reusable foundation skills:

- `milestone-session-bootstrap`
- `decision-gate-audit`
- `implementation-work-packet`
- `verification-evidence`
- `durable-handoff`
- `defect-triage`
- `controlled-git-delivery`
- `production-mutation-gate`

The workflow skills are:

- `milestone-implement`
- `address-review`
- `verify-implementation`
- `decision-brief`
- `commit-milestone`

Foundation skills do not independently grant implementation, Git, production, destructive-action, acceptance, or expanded-scope authority.

## Shared project startup requirements

Every milestone stage must establish the following project context. Claude performs this through `milestone-session-bootstrap`; Codex performs it directly under this runbook.

1. Read the applicable root instruction file: `CLAUDE.md` for Claude or `AGENTS.md` for Codex.
2. Read this runbook.
3. Read `docs/milestones/README.md` in full.
4. Resolve the current command to exactly one milestone file under `docs/milestones/`, then read it in full.
5. Read the canonical product, architecture, implementation, audit, or mockup sections linked by that milestone when they affect the requested stage.
6. Read `.handoffs/M#-handoff.md` when present.
7. Run `git status --short` and identify pre-existing or unrelated changes that must be preserved.
8. Inspect the milestone status, prerequisites, Decision Log, Risk Log, Evidence Index, scope, work packets, acceptance criteria, model and effort routing, rollback expectations, and approval gate.
9. State the resolved milestone, stage, role, current status, handoff condition, and worktree condition before continuing.

Facts, inferences, proposals, approvals, and evidence must remain distinct.

## Durable handoff requirement

Every Claude Implementation, Correction, and Verification stage and every Codex Readiness, QA, and Re-review stage must read and update:

```text
.handoffs/M#-handoff.md
```

The `.handoffs/` directory is intentionally gitignored unless the repository explicitly states otherwise.

Rules:

- Preserve sections written by the other agent and prior stages.
- Add a clearly labeled section for the current stage and review pass.
- Do not place secrets, credentials, cookies, OAuth material, private task names or notes, raw production records, or prohibited private content in the handoff.
- A stage is not complete until its handoff section is written.
- If the handoff cannot be written, report the stage as `Blocked` or `Partial`.
- The checked-in milestone remains authoritative for decisions, risks, status, acceptance criteria, and final approval.

Claude performs this through `durable-handoff`. Codex follows the handoff requirements in `AGENTS.md` and this runbook.

# Stage 1: Readiness

## Trigger examples

```text
M0 Readiness
Run the M0 Readiness checks
Run M3 PM review
```

## Role and mode

Codex acts as an independent analyst and PM. This stage is read-only except for the required local handoff update. Do not implement application code, correct findings, commit, push, deploy, or mutate external systems.

Use High reasoning for routine scope and readiness checks. Use Extra High for architecture, authorization, privacy, migration, recovery, hardening, or launch readiness.

## Review requirements

After shared startup, verify:

- Every prerequisite is accepted and supported by evidence.
- Blocking product, architecture, permission, privacy, lifecycle, migration, production, and terminology decisions are explicit.
- In-scope and out-of-scope boundaries agree across the milestone and canonical plans.
- Each committed deliverable maps to observable acceptance criteria and required evidence.
- Failure, denial, boundary, accessibility, security and privacy, migration, recovery, and rollback expectations are present where relevant.
- The next work packet is small enough for independent review and does not silently cross milestones.
- The recommended Claude model and effort match the risk, with fallback risk made explicit.
- Required environments, fixtures, credentials, devices, and external dependencies are identified without embedding secrets or private content.
- Pre-existing worktree changes can be preserved and will not make the packet unsafe to review.

Classify actionable findings using the repository's P0 through P3 definitions. Findings must be consequential and evidence-backed. Do not report formatting preferences, implausible hypotheticals, or deterministic lint issues better enforced by CI.

For each blocking decision, use:

```text
Decision ID and title:
Why it is needed now:
Constraints and evidence:
Option A and consequences:
Option B and consequences:
Recommendation:
Default if deferred, only when safe:
Decision owner:
```

## Required output

```text
Readiness verdict: READY | NOT READY | READY WITH RECORDED CONDITIONS
Milestone resolved:
Current milestone status:
Codex reasoning level used:

Findings, P0 through P3:
- [Severity] Title, evidence, impact, and required correction or decision.

Prerequisite and decision audit:
- Satisfied:
- Missing or ambiguous:

Scope and traceability audit:
- Deliverable to acceptance criterion or evidence gaps:
- Scope conflicts or likely creep:

Recommended next work packet:
Outcome:
In scope:
Out of scope:
Dependencies and decisions:
Claude model and effort required:
Independent verification required:

Decision briefs:
- Include only when blocked.

Handoff updated:
Next action for Brian:
Next action for Claude:
```

If there are no substantive findings, state `No actionable findings.` Do not manufacture findings.

# Stage 2: Implementation

## Trigger examples

```text
M1 Implementation
Run M1 Implementation
Implement M3
Continue M4 Implementation
```

## Required Claude routing

Claude must invoke:

```text
milestone-implement <milestone ID> [optional packet or scope]
```

The skill owns the repeatable Implementation procedure and must compose:

1. `milestone-session-bootstrap`
2. `decision-gate-audit`
3. `implementation-work-packet`
4. `verification-evidence`
5. `defect-triage` when needed
6. `durable-handoff`

The active milestone and repository instructions remain authoritative.

## Authorization boundary

An Implementation command authorizes only the next incomplete, approved work packet unless Brian explicitly names a different approved packet or a larger authorized packet range.

It does not authorize:

- Another packet or milestone.
- Product, architecture, schema, authorization, privacy, migration, or launch decisions.
- Commit, push, pull request creation, merge, deployment, migration execution, production changes, destructive actions, or milestone acceptance.

## Required result

The skill must:

- Resolve the exact milestone and packet from current authoritative sources.
- Confirm prerequisites and blocking decisions.
- Stop for a decision brief when a material decision is unresolved.
- Present the work-packet contract before editing.
- Preserve unrelated and pre-existing changes.
- Implement the smallest coherent approved change.
- Add relevant behavior and failure-path coverage.
- Run and record risk-based verification.
- Review the final diff and worktree.
- Update the durable handoff.
- Stop after the packet.

The final result must use the repository-required Implementation handoff format and report one of:

```text
Ready for PM/QA
Partial
Blocked
```

If not all milestone packets and exit criteria are complete, do not report `Ready for PM/QA`.

# Claude self-verification

## Trigger examples

```text
M1 Verification
Verify M1 Implementation
Re-run M1 implementation checks
```

Claude must invoke:

```text
verify-implementation <milestone ID> [optional scope]
```

This is not independent QA. The skill may run approved checks and update evidence and handoff records, but it must not edit application code or convert failures directly into fixes.

A failed verification should direct the next action to `address-review` or `milestone-implement`, depending on whether the failure originated from Codex findings or incomplete implementation.

# Claude correction after review

## Trigger examples

```text
Address M1 review findings P1-01 and P2-03
Fix all M1 QA findings
Correct M3 finding P2-02
```

Claude must invoke:

```text
address-review <milestone ID> <exact finding IDs or explicit all>
```

If Brian does not identify findings and does not explicitly say all, Claude must enumerate the open actionable findings and stop rather than assuming scope.

Correction authorizes only the selected findings and the smallest required regression coverage. It does not authorize unrelated milestone work, changed acceptance criteria, commit, deployment, production mutation, or acceptance.

The required result is:

```text
Ready for re-review
Partial
Blocked
```

# Decision brief

## Trigger examples

```text
M1 Decision: authentication provider scope
Prepare a decision brief for M3 ownership transfer
```

Claude may invoke `decision-brief` directly, or `milestone-implement` may invoke it when `decision-gate-audit` blocks dependent work.

The brief is read-only. It must separate facts, inferences, proposals, and approvals; present materially distinct options; recommend one option; identify what may continue safely; and state the exact decision required from Brian.

A decision brief does not record or approve the decision. The authoritative milestone Decision Log or Brian's explicit instruction must do that.

# Commit operation

## Trigger example

```text
/commit-milestone M1
```

`commit-milestone` is intentionally direct-invocation only. A natural-language request such as `Commit M1` should cause Claude to ask Brian to invoke the slash command.

The command authorizes exactly one local commit after:

- Milestone bootstrap.
- Controlled Git delivery checks.
- Required verification freshness checks.
- README accuracy review when required.
- Exact staged-diff review.
- Durable handoff update.

It does not authorize push, pull request creation, merge, deployment, release, tag, amend, squash, rebase, reset, force-push, or history rewrite.

# Production and external mutation gate

Any request involving deployment, migration execution, destructive data work, DNS, OAuth, production configuration, or another external-system mutation must first invoke:

```text
production-mutation-gate <exact action> <exact non-secret target>
```

The gate never performs the mutation. It establishes the exact action, target, blast radius, backup and recovery evidence, rollback or containment, monitoring, required approvals, and a second-turn confirmation phrase.

Implementation, testing, milestone completion, or a general instruction to continue is not production authorization.

# Stage 3: QA

## Trigger examples

```text
M1 QA
Review M1 for QA
Run M3 gate review
```

## Role and mode

Codex acts as independent PM and QA reviewer. Claude's handoff must be available in `.handoffs/M#-handoff.md` and supported by repository evidence.

This stage is read-only except for the required handoff update. Do not implement fixes, rewrite application files, commit, push, deploy, mutate external systems, or perform destructive actions.

Use High reasoning for routine packets. Use Extra High for authentication, authorization, privacy, public data, migrations, recovery, hardening, or launch.

## Review boundary

After shared startup:

1. Read Claude's handoff and identify claimed files, behavior, checks, evidence, gaps, model and effort, and preserved pre-existing changes.
2. Determine and inspect the complete implementation diff or commit range. Never review only Claude's summary.
3. Read every changed file and nearby code required to understand callers, data flow, policies, failure paths, and tests.
4. Compare the milestone status, Decision Log, Risk Log, Evidence Index, and acceptance claims with observed evidence.
5. Independently run relevant narrow checks and applicable milestone-required checks.

Review for:

- Correctness, regression, invalid assumptions, incomplete workflows, and state inconsistency.
- Authorization bypass, IDOR, stale session or role behavior, privacy boundaries, public-field leakage, unsafe caching, private-content exposure, and destructive actions where applicable.
- Schema and migration constraints, ownership invariants, idempotency, deterministic reconciliation, recovery, and rollback where applicable.
- Loading, empty, error, denial, conflict, stale or offline, long-text, accessibility, keyboard, touch, no-hover, and reference-viewport behavior where applicable.
- Missing tests for plausible denial, failure, boundary, and state-transition regressions.
- Scope creep, unrelated edits, debug output, generated artifacts, dependency or configuration changes, and overstated evidence.
- Consistency with approved product and architecture decisions and the active packet.

Mark blocked checks `NOT RUN`, with the reason and residual risk. Do not use production data or expose credentials or private content.

Findings must identify a concrete failure or milestone violation, explain impact, cite tight file and line, command, test, or reproducible evidence, and state the required safe outcome.

## Required output

Return findings first, ordered P0 through P3:

```text
Findings:
- [Severity] Title
  - Evidence: file and line, test, command, or reproducible behavior
  - Impact: affected user, data, or gate
  - Required correction: observable safe outcome
  - Regression evidence required: test or manual proof

Gate recommendation: RECOMMEND ACCEPTANCE | CHANGES REQUESTED | BLOCKED
Milestone and work packet reviewed:
Diff or commit range reviewed:
Codex reasoning level used:

Acceptance criteria:
- Verified:
- Not verified:
- Incorrectly claimed or missing evidence:

Checks independently run:
- Command or check: PASS | FAIL | NOT RUN, with concise evidence

Manual, visual, and device verification:
- Performed:
- Still required:

Security, privacy, migration, and rollback assessment:
Scope and unrelated-change assessment:
Open P0 and P1 count:
P2 and P3 disposition needed:

Handoff updated:
Recommended milestone status:
Required next action for Claude:
Required decision or validation from Brian:
```

If no substantive findings exist, write `No actionable findings.` Do not mark the milestone `Accepted`.

# Stage 4: Re-review

## Trigger examples

```text
M1 Re-review
Re-review M1 after Claude's fixes
Run M5 remediation review
```

## Role and mode

Codex independently verifies remediation. The original Codex review and Claude's correction handoff must be available.

This stage is read-only except for the required handoff update.

## Review requirements

After shared startup:

1. Read the original findings and Claude's remediation handoff.
2. Inspect the complete remediation diff plus surrounding code and tests.
3. Rerun every finding's reproduction or regression check and the narrow suite affected by the fix.
4. Check for new regressions, scope creep, misleading evidence, or changes to accepted decisions.
5. Verify milestone status and Evidence, Risk, and Decision logs against observed results.

For each original finding, report:

```text
Finding title and severity:
Status: RESOLVED | PARTIALLY RESOLVED | NOT RESOLVED | CANNOT VERIFY
Evidence observed:
Remaining impact or risk:
Required next action:
```

Then report new actionable findings, if any, ordered P0 through P3.

## Required output

```text
Re-review recommendation: RECOMMEND ACCEPTANCE | CHANGES REQUESTED | BLOCKED
Milestone and remediation range reviewed:
Checks run and results:
Original finding dispositions:
New findings:
Acceptance evidence now complete:
Acceptance evidence still missing:
Open P0 and P1 count:
Handoff updated:
Recommended milestone status:
Next action for Claude:
Next action or decision for Brian:
```

Do not mark the milestone `Accepted`.

## Project and skill boundary

This checked-in runbook is the canonical Dash2 command and role-routing contract.

- `CLAUDE.md` defines Claude's Dash2-specific authority, project guardrails, and natural-language skill routing.
- `AGENTS.md` defines Codex's Dash2-specific review authority.
- This runbook defines command grammar, ownership, stage results, and the full Codex review procedures.
- Installed Claude skills implement repeatable Claude workflows.
- Milestone documents define project-specific scope, decisions, models, tests, evidence, rollback, and gates.

The reusable Claude procedures belong in the installed skills. Do not copy their full internal procedures back into this runbook. This file should state what must be invoked, what authority applies, and what outcome is required.

For another project, reuse the skill pack and create project-specific `CLAUDE.md`, `AGENTS.md`, milestone index, and command runbook that define that project's authority and source-of-truth hierarchy.

**Last updated:** 2026-07-23
