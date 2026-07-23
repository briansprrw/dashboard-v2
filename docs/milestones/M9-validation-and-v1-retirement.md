# M9 — Validation and V1 Retirement

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `high` effort  
**Estimated duration:** 1–2 calendar weeks of use; 1–3 focused days  
**Production impact:** V1 becomes archived/read-only or is retired only after Gate G

## Outcome

Validate Dash2 under normal use, resolve launch defects, prove data/access consistency through the recovery window, and make an explicit, recoverable decision about V1 disposition and residual infrastructure.

## Prerequisites

- M8 launch is successful.
- Observation and recovery-window start/end are recorded.
- V1 remains unchanged/readily recoverable as defined by the launch plan.

## In scope

- Monitor operational and product success measures.
- Triage and correct launch defects with regression tests and controlled releases.
- Compare user/sheet/membership/task counts and recent-change integrity.
- Validate real narrow desktop, phone, tablet, full desktop, and smart-frame use.
- Collect workflow feedback without automatically expanding launch scope.
- Decide disposition of V1-only capabilities/data.
- Inventory and archive/retire V1 routes, Worker, D1, KV, OAuth callback, secrets, monitoring, DNS, repository state, and recovery material according to approved retention.
- Finalize Dash2 operational ownership and backlog.

## Out of scope

- Immediate deletion of V1 data/infrastructure.
- Treating feature requests as defects without triage.
- Destroying recovery points, exports, logs, or credentials outside approved retention policy.
- Reusing V1 secrets/resources in Dash2 for convenience.

## Work packets

### M9.1 — Validation window

Track login success/failure, errors, latency, D1/KV failures, public behavior, support reports, and data/invariant checks. Repeat representative user/device workflows and compare recent changes.

### M9.2 — Launch-defect releases

Classify defects, reproduce, add regression tests, review scope/security/migration impact, and deploy through the approved release path. P0 invokes incident/rollback criteria; P1 blocks V1 retirement.

### M9.3 — V1 disposition brief

Inventory V1-only behavior and infrastructure. For each item, recommend migrate/add later, export/archive, retain read-only temporarily, or intentionally abandon. Include cost, privacy, recovery, and operational impact.

### M9.4 — Retirement execution

Only after Brian's Gate G approval, follow a separately reviewed checklist to remove public routing/write access, revoke/rotate obsolete credentials, archive code/config, retain approved data/recovery artifacts, and verify Dash2 independence. Destructive deletion requires its own explicit confirmation.

## Acceptance criteria

- [ ] The full approved validation window completes without unresolved P0/P1.
- [ ] Operational measures remain within accepted thresholds or have approved remediation.
- [ ] Automated count/invariant checks and sampled recent changes show no unexplained data/access drift.
- [ ] Real target devices and core workflows remain usable under normal use.
- [ ] Every launch defect has severity, reproduction, disposition, regression evidence, and release identifier if fixed.
- [ ] V1-only capabilities and data have explicit dispositions.
- [ ] The V1 infrastructure inventory identifies routes, compute, databases, KV, OAuth, secrets, DNS, monitoring, repositories, exports, and recovery retention.
- [ ] Dash2 has no runtime dependency on V1.
- [ ] Retirement/archival preserves the approved recovery and legal/privacy needs.
- [ ] Brian records Gate G approval before any V1 retirement action.
- [ ] Post-retirement checks prove Dash2 login, data, mutations, public controls, monitoring, and recovery remain intact.

## Required evidence

- Validation-window dashboard/summary with no private content.
- Periodic reconciliation/invariant reports.
- Device/user acceptance record.
- Launch-defect register and release evidence.
- V1-only behavior disposition table.
- V1 infrastructure/credential/retention inventory.
- Gate G decision and retirement verification checklist.

## QA approach

Codex distinguishes launch regression from enhancement, reruns high-risk workflows after every launch fix, audits the infrastructure inventory, and verifies Dash2 independence before recommending retirement.

Opus reviews the retirement brief for hidden dependencies, recovery gaps, stale credentials/routes, privacy retention risk, and irreversible steps. It does not execute destructive actions.

## Rollback/containment

Before Gate G, M8 rollback remains available under its approved conditions. After V1 is archived/read-only, restoration follows the retained recovery runbook. Destructive V1 deletion, if ever approved, is a later explicit operation with no implied rollback.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M9-E1 | Validation window/operations | Pending | Pending | Codex |
| M9-E2 | Data/access consistency | Pending | Pending | Codex |
| M9-E3 | Defect/device validation | Pending | Pending | Codex |
| M9-E4 | V1 disposition/inventory | Pending | Pending | Opus/Codex |
| M9-E5 | Gate G and retirement verification | Pending | Pending | Brian/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M9-D1 | — | Pending: V1 retirement/archive disposition | Brian | Gate G |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M9-R1 | P0 | V1 retired before hidden dependency found | Dependency inventory and validation window | Codex | Open |
| M9-R2 | P1 | Enhancement churn obscures launch defects | Triage and scope control | Codex | Open |
| M9-R3 | P1 | Stale routes/secrets remain active | Retirement inventory and post-checks | Claude | Open |

## PM/QA Sign-off

```text
Claude status: Not Started
Claude handoff date: —
Codex review: Pending
Open P0/P1: 0
Brian decision: Pending
Decision date: —
Notes: —
```

