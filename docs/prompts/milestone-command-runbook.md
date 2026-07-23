# Dash2 Milestone Command Runbook

This is the shared execution protocol for Claude and Codex. The root `CLAUDE.md` and `AGENTS.md` files route milestone commands here.

No prompt copying or milestone-variable editing is required. Start a fresh task in the appropriate tool and use one of these commands:

```text
Run M0 Readiness
Run M1 Implementation
Run M1 QA
Run M1 Re-review
```

Natural variants are accepted, including:

```text
Run the M0 Readiness checks
Run M1 Implementation
Review M1 for QA
Re-review M1 after Claude's fixes
```

## Command grammar

```text
Run <milestone ID> <stage>
```

- **Milestone ID:** `M0` through the highest milestone defined in `docs/milestones/README.md`.
- **Stage:** `Readiness`, `Implementation`, `QA`, or `Re-review`.
- `Readiness checks`, `PM review`, and `plan review` map to **Readiness**.
- `Implement` and `execution` map to **Implementation**.
- `review`, `gate review`, and `independent review` map to **QA**.
- `remediation review` maps to **Re-review**.

If the command does not identify exactly one milestone and stage, ask for the missing value. Do not infer a different milestone from recent work.

## Stage ownership

| Stage | Primary tool/role | Purpose | Maximum result |
|---|---|---|---|
| Readiness | Codex as analyst/PM | Decide whether a milestone or next packet is ready | Readiness recommendation |
| Implementation | Claude as implementation lead | Complete the next approved work packet | `Ready for PM/QA` |
| QA | Codex as independent reviewer | Review actual implementation and evidence | Gate recommendation |
| Re-review | Codex as independent reviewer | Verify remediation of prior findings | Updated gate recommendation |

Brian is the product owner and only final milestone approver. Neither tool may mark a milestone `Accepted`, approve its own implementation, begin a dependent milestone, or authorize production/destructive actions.

If Claude receives a Readiness, QA, or Re-review command, it must identify that the independent stage belongs to Codex and stop unless Brian explicitly changes the role assignment. If Codex receives an Implementation command, it must identify that implementation belongs to Claude and stop unless Brian explicitly assigns Codex to implement.

## Shared command startup

Every stage begins with the following sequence:

1. Read the applicable root instruction file: `CLAUDE.md` for Claude or `AGENTS.md` for Codex.
2. Read `docs/milestones/README.md` in full.
3. Resolve the command's milestone ID to the single file under `docs/milestones/` whose filename begins with that ID, then read it in full.
4. Read the canonical product, architecture, and implementation-plan sections linked by that milestone. Read relevant audits or mockups only when they affect the active stage.
5. Run `git status --short` and identify pre-existing changes that must be preserved.
6. Inspect the milestone status, prerequisites, Decision Log, Risk Log, Evidence Index, scope, work packets, acceptance criteria, model/effort routing, rollback, and approval gate.
7. State the resolved milestone file, stage, role, current status, and worktree condition before continuing.

Facts, proposals, inferences, and approvals must remain distinct. An unchecked plan item, mockup, agent summary, existing implementation, or passing test is not Brian's approval.

## Stage 1 — Readiness

### Trigger examples

```text
Run M0 Readiness
Run the M0 Readiness checks
Run M3 PM review
```

### Role and mode

Codex acts as an independent analyst/PM. This stage is read-only unless Brian explicitly requests planning-document updates after the findings are delivered. Do not implement application code or fix findings during the review.

Use High reasoning for routine scope/readiness checks and Extra High for architecture, authorization, privacy, migration, recovery, hardening, or launch readiness.

### Review requirements

After shared startup, verify:

- Every prerequisite is accepted and supported by evidence.
- Blocking product, architecture, permission, privacy, lifecycle, migration, production, and terminology decisions are explicit.
- In-scope and out-of-scope boundaries agree across the milestone and canonical plans.
- Each committed deliverable maps to observable acceptance criteria and required evidence.
- Failure, denial, boundary, accessibility, security/privacy, migration, recovery, and rollback expectations are present where relevant.
- The next work packet is small enough for independent review and does not silently cross milestones.
- The recommended Claude model/effort matches the risk; any fallback risk is explicit.
- Required environments, fixtures, credentials, devices, and external dependencies are identified without embedding secrets or private content.
- Pre-existing worktree changes can be preserved and will not make the packet unsafe to review.

Classify findings with the repository's P0–P3 definitions. Findings must be consequential and evidence-backed. Do not report formatting preferences, implausible hypotheticals, or deterministic lint issues better left to CI.

For each blocking decision, use:

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

### Required output

```text
Readiness verdict: READY | NOT READY | READY WITH RECORDED CONDITIONS
Milestone resolved:
Current milestone status:
Codex reasoning level used:

Findings (P0 → P3):
- [Severity] Title — evidence, impact, and required correction or decision.

Prerequisite and decision audit:
- Satisfied:
- Missing/ambiguous:

Scope and traceability audit:
- Deliverable → acceptance criterion/evidence gaps:
- Scope conflicts or likely creep:

Recommended next work packet:
Outcome:
In scope:
Out of scope:
Dependencies/decisions:
Claude model/effort required:
Independent verification required:

Decision briefs:
- Include only when blocked.

Next action for Brian:
Next action for Claude:
```

If there are no substantive findings, say so explicitly. Do not manufacture findings.

## Stage 2 — Implementation

### Trigger examples

```text
Run M1 Implementation
Run M3 Implement
Run M4 execution
```

### Role and mode

Claude acts as implementation lead. It may execute only the next incomplete, approved work packet in the target milestone unless Brian explicitly approves a larger batch.

Claude must use the model and effort specified by the milestone. If the current model/effort is insufficient, stop before implementation and provide the exact `/model` and `/effort` commands. Do not silently downgrade.

### Readiness gate

After shared startup, confirm:

- The milestone is `Accepted` at every prerequisite gate and is ready to enter or continue.
- No required decision or input is unresolved.
- The next incomplete work packet is unambiguous.
- The worktree permits a narrow, reviewable diff while preserving pre-existing changes.

If any material product, architecture, authorization, privacy, destructive-lifecycle, migration, or production decision is unresolved, do not guess. Prepare the decision brief defined in the Readiness stage, record/retain the appropriate blocked status, and wait.

### Work-packet contract

Before editing, print:

```text
Milestone: [resolved ID and name]
Work packet: [ID and name]
Outcome: [observable result]
In scope: [behavior and likely files]
Out of scope: [adjacent work excluded]
Dependencies/decisions: [IDs or none]
Model/effort: [active model and level]
Verification: [exact automated and manual evidence]
```

Then investigate, implement, and verify that packet under these rules:

- Read before editing and follow approved architecture and repository conventions.
- Keep the diff narrow; do not add parity, refactors, upgrades, or features outside the packet.
- Preserve unrelated and pre-existing changes.
- Add tests with behavior, including important denial, validation, failure, and boundary paths.
- Treat server authorization as authoritative; hidden controls are not security.
- Never expose secrets, credentials, cookies, OAuth material, production exports, emails, task names/notes, or other private content in source, logs, prompts, fixtures, screenshots, or evidence.
- Never claim a check passed unless it ran in the current worktree and the result was observed. Mark unavailable checks `NOT RUN`, explain why, and state residual risk.
- Do not commit, push, open/merge a PR, deploy, change Cloudflare/DNS/OAuth, update external trackers, reset data, or perform destructive operations unless Brian explicitly requests that exact action.
- Stop immediately on a P0 condition. Do not improvise a production or migration repair.

### Before handoff

1. Run the packet's narrow tests and every milestone-required check currently applicable.
2. Review the final diff for scope, correctness, secrets, private data, debug output, generated artifacts, and accidental unrelated edits.
3. Update only the active milestone's status, Decision Log, Risk Log, and Evidence Index when actual evidence supports the update.
4. Set `Ready for PM/QA` only if all committed packets and exit criteria are complete. Otherwise use `Partial`, `Blocked`, or `In Progress` accurately.
5. Leave the repository runnable or explain why it is not.

### Required output

```text
Status: Ready for PM/QA | Blocked | Partial | In Progress
Milestone/work packet:
Outcome:
Files changed:
Behavior changed:
Decisions made within Claude's authority:
Tests/checks run and results:
Manual verification:
Acceptance criteria/evidence updated:
Known gaps and risks:
Unrelated pre-existing changes preserved:
Resolved model/effort used:
Recommended independent reviewer model/effort:
Next action for Codex/Brian:
```

Stop after the handoff. Do not continue into another packet without review or explicit instruction.

## Stage 3 — QA

### Trigger examples

```text
Run M1 QA
Review M1 for QA
Run M3 gate review
```

### Role and mode

Codex acts as independent PM/QA reviewer. Claude's complete handoff must be available in the task or milestone evidence. This stage is read-only: do not implement fixes, rewrite the milestone, commit, push, deploy, mutate external systems, or perform destructive actions.

Use High reasoning for routine packets and Extra High for auth, authorization, privacy, public data, migrations, recovery, hardening, or launch.

### Review boundary

After shared startup:

1. Read Claude's handoff and identify claimed files, behavior, checks, evidence, gaps, and pre-existing changes.
2. Inspect the actual complete diff/commit range. Determine the correct base from the handoff and repository history; never review only Claude's summary.
3. Read every changed file and nearby code needed to understand callers, data flow, policies, failure paths, and tests.
4. Compare the milestone status, Decision Log, Risk Log, Evidence Index, and acceptance claims with observed evidence.

Review for:

- Correctness, regression, invalid assumptions, incomplete workflows, and state inconsistency.
- Authorization bypass, IDOR, stale session/role behavior, privacy boundaries, public-field leakage, unsafe caching, secret/private-content exposure, and destructive actions where applicable.
- Schema/migration constraints, ownership invariants, idempotency, deterministic reconciliation, recovery, and rollback where applicable.
- Loading, empty, error, denial, conflict, stale/offline, long-text, accessibility, keyboard/touch/no-hover, and reference-viewport behavior where applicable.
- Missing tests for plausible denial, failure, boundary, and state-transition regressions.
- Scope creep, unrelated edits, debug output, generated artifacts, dependency/config changes, and overstated evidence.
- Consistency with approved product/architecture decisions and the active packet.

Independently rerun narrow relevant checks and applicable milestone-required checks. Add safe, non-mutating diagnostics if needed. Mark blocked checks `NOT RUN` with reason and residual risk. Do not use production data or expose credentials/private content.

Findings must identify a concrete failure or milestone violation, explain impact, cite tight file/line or reproducible evidence, and state the required safe outcome. Ignore purely mechanical style issues unless CI fails or behavior is affected. Use inline code comments when supported and keep line ranges tight.

### Required output

Return findings first, ordered P0 → P3:

```text
Findings:
- [Severity] Title
  - Evidence: file/line, test, command, or reproducible behavior
  - Impact: affected user/data/gate
  - Required correction: observable safe outcome
  - Regression evidence required: test or manual proof

Gate recommendation: RECOMMEND ACCEPTANCE | CHANGES REQUESTED | BLOCKED
Milestone/work packet reviewed:
Diff/commit range reviewed:
Codex reasoning level used:

Acceptance criteria:
- Verified:
- Not verified:
- Incorrectly claimed or missing evidence:

Checks independently run:
- Command/check — PASS | FAIL | NOT RUN, with concise evidence

Manual/visual/device verification:
- Performed:
- Still required:

Security/privacy/migration/rollback assessment:
Scope and unrelated-change assessment:
Open P0/P1 count:
P2/P3 disposition needed:

Recommended milestone status:
Required next action for Claude:
Required decision or validation from Brian:
```

If no substantive findings exist, write `No actionable findings.` Do not mark the milestone `Accepted`; Brian owns acceptance.

## Stage 4 — Re-review

### Trigger examples

```text
Run M1 Re-review
Re-review M1 after Claude's fixes
Run M5 remediation review
```

### Role and mode

Codex verifies remediation independently and read-only. The original Codex review and Claude's remediation handoff must be available.

### Review requirements

After shared startup:

1. Read the original findings and Claude's remediation handoff.
2. Inspect the actual remediation diff plus surrounding code and tests.
3. Rerun every finding's reproduction/regression check and the narrow suite affected by the fix.
4. Check for new regressions, scope creep, misleading evidence, or changes to accepted decisions.
5. Verify milestone status and Evidence/Risk/Decision logs against observed results.

For each original finding, report:

```text
Finding title/severity:
Status: RESOLVED | PARTIALLY RESOLVED | NOT RESOLVED | CANNOT VERIFY
Evidence observed:
Remaining impact/risk:
Required next action:
```

Then report new actionable findings, if any, ordered P0 → P3 with tight file/line or reproducible evidence.

### Required output

```text
Re-review recommendation: RECOMMEND ACCEPTANCE | CHANGES REQUESTED | BLOCKED
Checks run and results:
Acceptance evidence now complete:
Acceptance evidence still missing:
Open P0/P1 count:
Recommended milestone status:
Next action for Claude:
Next action or decision for Brian:
```

Do not mark the milestone `Accepted`; Brian owns acceptance.

## Cross-project reuse

This checked-in runbook is the canonical project workflow. The root tool files are intentionally thin:

- `CLAUDE.md` gives Claude project context and routes milestone commands here.
- `AGENTS.md` gives Codex project context and routes milestone commands here.
- This file defines the repeatable stages and output contracts.
- The milestone documents define project-specific scope, decisions, models, tests, and gates.

For use across unrelated projects, package the command parser and four stage procedures as a personal skill in each tool while keeping product-specific facts in each repository:

- Claude personal skill: `~/.claude/skills/milestone-workflow/SKILL.md`.
- Codex personal skill: `~/.agents/skills/milestone-workflow/SKILL.md`.

Both tools use `SKILL.md`-based skills, so the workflow body can stay nearly identical. Use small tool-specific adapters only where model controls, instruction-file discovery, or output directives differ. Do not place project-specific stack, filenames, commands, or milestone decisions in the personal skill; the skill must discover those from `CLAUDE.md`/`AGENTS.md` and `docs/milestones/`.

Promote this runbook into personal skills after it has been exercised through at least one full readiness → implementation → QA → re-review cycle and corrected for real friction.

**Last updated:** 2026-07-23
