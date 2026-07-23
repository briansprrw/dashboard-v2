# M6 — Migration and Reconciliation

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort +think (Claude Fable 5, `high`, only as a fallback if a specific rehearsal genuinely needs a long autonomous session)  
**Review model:** Independent Claude Opus 4.8, `xhigh`  
**Estimated focused time:** 5–8 days; any V1 profiling requires separate authorization during M6
**Production impact:** Staging imports only; production source remains unchanged

## Outcome

Build and prove a repeatable, auditable V1-to-Dash2 migration that accounts for every source record, preserves only approved data and ownership, records intentional omissions, quarantines anomalies, exposes no private content in logs/reports, and produces identical logical results across clean runs.

## Prerequisites

- M0 migration mapping/policies are Accepted.
- Destination schema affected by migration is stable through M4/M5 as applicable.
- Approved read-only source access and isolated target access exist.
- Synthetic and sanitized production-shape fixtures are available.

## In scope

- If Brian separately authorizes it during M6, create a fresh aggregate-only V1 source profile using approved read-only access. M0 establishes no live-source profile.
- Deterministic extraction, validation, transformation, loading, and reconciliation.
- V1-to-Dash2 ID mappings and optional internal legacy reconciliation IDs.
- Approved mapping of users/identities, Lists/owners, tasks, flags, ordering, and timestamps.
- Explicit count-only dispositions for V1 sharing/access-control rows, settings, and invite codes, which are not migrated.
- Dry run, idempotent batch behavior, anomaly quarantine, dropped/transformed report, and redacted logs.
- Synthetic, sanitized-shape, and current staging rehearsals.
- Two consecutive clean rehearsals with no unexplained discrepancy.
- Cutover timing and rollback inputs for M8.

## Out of scope

- Mutating V1.
- Production cutover/write freeze.
- Dual writes, reverse migration, or ad hoc copying.
- Inventing owners, permissions, dates, or task values for invalid rows.
- Logging task names, notes, emails, tokens, exports, or raw private rows.
- Keeping production exports in source control or durable unapproved locations.

## Migration contract

```text
Extract (read-only source + source fingerprint)
  → Validate (known shape + anomaly inventory)
  → Transform (deterministic mappings + approved normalization)
  → Load (empty target or isolated batch)
  → Reconcile (counts + invariants + sampled content hashes)
  → Report (imported/transformed/skipped/rejected; redacted)
```

Every source row receives one disposition: imported unchanged, imported transformed, intentionally skipped, or rejected/quarantined with reason.

## Work packets

### M6.1 — Source profile and mapping specification

Only if Brian separately authorizes V1 access during M6, create a fresh aggregate-only source profile with approved read-only controls. Profile tables, counts, nulls, ranges, duplicates, orphans, enum/date variants, ownership contradictions, setting-key counts, and invite-state counts. Update the mapping table with approved decisions; use aggregates and synthetic examples, never real values. Do not treat M0 as containing a source profile.

### M6.2 — Deterministic migration tool

Implement dry-run and load modes, source fingerprint/batch ID, deterministic mappings, explicit destination columns, bounded batches, redacted structured output, and safe failure behavior. Runtime Dash2 must not receive V1 credentials/bindings.

### M6.3 — Reconciliation and invariants

Report totals by role/state, owner, List, task status/priority/open state, omitted access-control/settings/invite rows, invalid dates, orphans, duplicates, and quarantine. Check foreign keys, exactly-one-owner, valid enums, and protected-content eligibility.

### M6.4 — Rehearsals

Run synthetic edge-case, sanitized-shape, and current staging rehearsals. Each current-data rehearsal begins with an approved fresh target and ends with user sampling. Repeat until two clean runs have identical logical output and no unexplained difference.

### M6.5 — Independent migration review

Use a fresh Opus `xhigh` review for missing categories, nondeterminism, privacy in artifacts, permission escalation, timestamp/order loss, partial-failure recovery, target reset safety, and cutover/rollback assumptions.

For a full current-data rehearsal spanning a long autonomous session, Fable 5 `high` may orchestrate the run. It may not approve source access, delete/reset a target, or perform production actions.

## Acceptance criteria

- [ ] Source access used by tooling is technically and operationally read-only.
- [ ] Application runtime has no V1 binding or migration credential.
- [ ] Dry run performs no destination writes and produces a complete redacted disposition report.
- [ ] The same source fingerprint produces deterministic mappings and logical output.
- [ ] Re-running a batch cannot silently duplicate records.
- [ ] Every source row is accounted for by a disposition and reason.
- [ ] No destination List is ownerless and no task references a missing entity.
- [ ] Approved users/roles, List ownership, names, notes, dates, statuses, priorities, flags, ordering, and timestamps reconcile.
- [ ] V1 sharing/access-control, settings, and invite-code rows are not imported and are fully accounted for by redacted counts.
- [ ] Invalid rows are quarantined/reported; values are not silently invented.
- [ ] Reports/logs/source control contain no private content, exports, or secrets.
- [ ] Two consecutive clean current-shape staging rehearsals have identical logical results and no unexplained discrepancy.
- [ ] The active user validates representative counts, ownership, and sampled content in staging; historical test users are validated only as applicable to their migrated account state.
- [ ] M8 receives a measured migration duration, commands, preconditions, stop conditions, and rollback inputs.
- [ ] Independent Opus review has no unresolved P0/P1.

## Required evidence

- Approved mapping specification and source profile summary.
- Dry-run report schema and redaction test.
- Two rehearsal batch IDs/source fingerprints, timing, reconciliation summaries, and invariant results.
- Difference report proving repeatability.
- User validation record using no private content in the milestone doc.
- Sensitive temporary-artifact deletion/retention record.
- Independent review findings and dispositions.

## QA approach

Codex injects duplicates, orphan references, invalid dates/enums, missing owners, case variants, conflicting legacy access, empty notes, very long values, canceled/exhausted legacy invites, and dropped settings. QA compares source aggregates to target aggregates, confirms excluded categories remain excluded, and verifies sampled private values only in the authorized environment, never copied to review docs.

Any source mutation, unexplained missing record, owner/access escalation, private-content leak, or nondeterministic logical result is P0/P1 and blocks launch.

## Rollback

Migration rehearsals target fresh isolated databases or approved batches. Preserve the source unchanged. On failure, retain the redacted diagnostic report, isolate the failed target, correct tooling, and rerun against a verified fresh target. Never merge a failed import forward by hand.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M6-E1 | Read-only/isolation proof | Pending | Pending | Codex |
| M6-E2 | Determinism/idempotency | Pending | Pending | Codex |
| M6-E3 | Reconciliation/invariants | Pending | Pending | Codex |
| M6-E4 | Two clean rehearsals | Pending | Pending | Brian/Codex |
| M6-E5 | Opus migration review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M6-D1 | — | Pending: final source-to-destination mappings | Brian | Data/access preservation |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M6-R1 | P0 | Missing/misassigned/private data | Deterministic mapping + reconciliation | Claude | Open |
| M6-R2 | P0 | Source mutation | Read-only credential/binding verification | Claude | Open |
| M6-R3 | P1 | Sensitive exports persist | Approved temp storage and deletion record | Claude | Open |

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
