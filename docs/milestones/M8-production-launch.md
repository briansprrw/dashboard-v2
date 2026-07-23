# M8 — Production Launch

**Status:** Not Started  
**Owner/commander:** Brian  
**Runbook assistant:** Claude  
**PM/QA observer:** Codex  
**Assistant model:** Claude Sonnet 5, `high` effort +think  
**Estimated focused time:** 2–4 days including observation  
**Production impact:** Production migration and user cutover

## Outcome

Migrate approved V1 data into a verified fresh Dash2 production target, open Dash2 to approved users, and retain a tested, time-bounded return path to unchanged V1 if a stop condition occurs.

Claude assists with the approved runbook and evidence. Claude does not independently authorize, schedule, start, continue through a failed gate, improvise data repair, or declare launch success.

## Prerequisites

- M7 and Gate F are Accepted.
- Two clean M6 rehearsals used the final migration build/schema.
- Brian approves the maintenance window, communication, launch candidate, known issues, and rollback thresholds.
- Exact production targets are independently verified and backups/recovery points are current.
- Named humans own go/no-go, Cloudflare/DNS/OAuth, migration, validation, communications, and rollback.

## Hard stop rules

Stop and obtain Brian's explicit decision if:

- Any command target, credential scope, schema version, source fingerprint, or release identifier differs from the runbook.
- Backup/export/recovery verification fails.
- The coordinated single-user pause cannot prevent V1 writes for the migration window.
- Migration/reconciliation produces any unexplained difference.
- A sheet/task is missing or assigned incorrectly.
- Authentication/session behavior fails for normal users.
- Any authorization failure or protected-data exposure appears.
- Primary narrow-display Glance mode is unusable.
- A write error risks data loss or the rollback deadline is reached.

No agent may “fix forward” production data ad hoc inside the launch window.

## Runbook gates

### L0 — Final go/no-go

- Freeze release candidate and migration tool checksums/identifiers.
- Confirm owners, communication, window, stop time, known issues, status page, and rollback route.
- Record Brian's `GO`.

### L1 — Recovery and targets

- Verify exact V1 source, Dash2 target, Worker/KV/routes, OAuth callback, DNS plan, and current D1 recovery point.
- Create/verify independent V1 export in approved sensitive storage.
- Confirm Dash2 target is fresh/expected and V1 remains unchanged.
- Record Brian's approval to begin the coordinated single-user pause.

### L2 — Coordinated V1 pause

- Confirm Brian has stopped V1 use and no other active user is expected during the window; no V1 application change or formal write-freeze feature is required.
- Verify the source has not changed during the pause.
- Capture final source fingerprint.
- Record Brian's approval to migrate.

### L3 — Production migration

- Run the exact versioned migration command.
- Capture redacted timing/status only.
- Run reconciliation and all invariant checks.
- Any unexplained output invokes a hard stop.

### L4 — Private validation

- Validate owner, admin, disabled-user, counts, sampled content, and primary display before general enablement. Validate viewer/editor only for V2 memberships deliberately created after migration; no V1 shares are imported.
- Record Brian's approval to open access.

### L5 — Enable Dash2

- Activate approved route/DNS/OAuth settings.
- Verify cookies, headers, health/version/schema, login, core mutations, Glance, and monitoring.
- Communicate availability.

### L6 — Observation

- Monitor authentication, 4xx/5xx, D1/KV, latency, reconciliation drift, and user-reported defects at the approved cadence.
- Keep V1 data unchanged and the rollback route ready for the approved validation period.

## Acceptance criteria

- [ ] Every gate has timestamp, operator, exact approved target/version, result, and Brian decision.
- [ ] Backup/export/recovery evidence predates the coordinated pause and is independently verified.
- [ ] Brian confirms the single-user V1 pause before the final fingerprint/export and V1 remains unchanged through migration.
- [ ] Migration uses the accepted tool/schema/release candidate without modification.
- [ ] Reconciliation and invariants match approved expected results with no unexplained difference.
- [ ] Owner/admin/disabled roles and representative data pass private validation, including Admin denial for private task/note/history reads and successful opaque Admin recovery without protected fields; deliberately created V2 viewer/editor memberships are tested if present.
- [ ] Primary narrow display and core create/edit/complete/move/recycle workflow pass in production.
- [ ] Health/version/schema, cookies, headers, OAuth, DNS, and monitoring are correct.
- [ ] No P0/P1 occurs during the initial observation window.
- [ ] Brian explicitly declares launch successful or orders rollback.

## Rollback triggers

- Missing/misassigned data or permission escalation.
- Protected-data exposure.
- Broad login/session failure.
- Unrecoverable or unsafe writes.
- Primary display unusable.
- Reconciliation/invariant drift.
- Observation threshold or rollback deadline exceeded.

## Rollback procedure

1. Brian orders rollback.
2. Disable Dash2 mutations.
3. Route users back to V1 and restore approved V1 write behavior.
4. Preserve Dash2 production state for diagnosis; do not merge writes back ad hoc.
5. Account for any post-launch Dash2 writes through a separate reviewed export/reconciliation plan.
6. Communicate rollback and new maintenance status.
7. Correct and rehearse against a fresh Dash2 target before rescheduling.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M8-E1 | L0–L2 approvals/recovery | Pending | Pending | Brian/Codex |
| M8-E2 | Migration/reconciliation | Pending | Pending | Brian/Codex |
| M8-E3 | Production role/data validation | Pending | Pending | Codex |
| M8-E4 | Route/OAuth/monitoring | Pending | Pending | Codex |
| M8-E5 | Launch/rollback decision | Pending | Pending | Brian |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M8-D1 | — | Pending: production GO | Brian | Authorizes launch runbook only |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M8-R1 | P0 | Wrong production target | Two-person exact-target verification | Brian/Codex | Open |
| M8-R2 | P0 | Divergent writes complicate rollback | V1 freeze and limited validation window | Brian | Open |
| M8-R3 | P1 | Improvised repair hides discrepancy | Hard stop; fresh rehearsal | Claude | Open |

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
