# M2 — Domain, Authentication, and Authorization

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Opus 4.8, `xhigh` effort  
**Review model:** Separate Claude Opus 4.8, `xhigh`, fresh context  
**Estimated focused time:** 5–7 days  
**Production impact:** Isolated staging API only

## Outcome

Deliver the stable server-side domain foundation: schema, repositories, services, Google OAuth/session lifecycle, invitations, and centrally enforced permissions for users, sheets, memberships, and tasks.

## Prerequisites

- M1 is Accepted.
- M0 role/action/visibility and lifecycle decisions are recorded.
- Isolated staging OAuth callback, D1, and KV resources are available.

## In scope

- Migrations for users, identities, auth/session support, sheets, memberships, tasks, preferences needed by core flows, invites/redemptions, task/audit events required by approved policy, and schema versioning.
- Explicit constraints, indexes, timestamps, archive fields, and approved identifiers.
- Repository and domain-service boundaries.
- Google OAuth with high-entropy, expiring, one-time state.
- Opaque server-side sessions, secure cookie policy, sliding/absolute expiry, logout, user/auth-version revocation, and active-user recheck.
- Owner/editor/viewer/admin policies and private task/note visibility.
- Atomic invite capacity/redemption.
- Runtime schemas, explicit DTOs, origin/CSRF defenses, bounded inputs, parameterized SQL, stable error codes.
- Unit, repository/integration, contract, and authorization-matrix tests.

## Out of scope

- Production OAuth/DNS or live-user onboarding.
- Complete frontend dashboard.
- Management/admin UI.
- Anonymous public routes.
- V1 migration importer.
- Optional search, bulk actions, recurrence, subtasks, tags, or attachments.

## Invariants to prove

- Every sheet has exactly one active owner.
- Owner membership/ownership cannot be removed without an atomic approved transfer.
- A disabled/deleted user cannot use an existing session.
- Role and auth-version changes take effect without waiting for cookie expiry.
- A task always references a valid sheet.
- Moving a task requires the approved rights in source and destination.
- Private tasks/notes obey the approved matrix on reads and writes.
- Invite capacity cannot be oversubscribed; canceled/expired invitations cannot provision access.
- Admin overrides create required audit evidence.
- External DTOs never expose database rows wholesale.

## Work packets

### M2.1 — Schema and repositories

Implement migrations with constraints/indexes and repositories that return domain records/DTO inputs rather than leaking raw rows through routes. Test actual SQL against a migrated database.

### M2.2 — Policy/service layer

Implement centralized policy functions and invariant-preserving services. Route handlers must not duplicate or bypass authorization policy.

### M2.3 — OAuth and sessions

Implement initiation, state storage/consumption, callback, eligibility, session creation/refresh/revocation, logout, cookie policy, and generic user-facing auth errors. Never log tokens, codes, state, cookies, or provider payloads.

### M2.4 — Invites and contracts

Implement approved invitation lifecycle and runtime validation. Test concurrent/competing redemption as closely as the platform supports.

### M2.5 — Adversarial review

In a fresh Opus context, review authorization bypasses, confused-deputy paths, ownerless states, IDOR, session fixation/replay, CSRF/origin behavior, invite races, enumeration, and sensitive error/log content. Claude implementing the feature may not be the only reviewer.

## Acceptance criteria

- [ ] Every migration applies to an empty database and the resulting constraints/indexes match the approved model.
- [ ] Repository integration tests execute the real SQL for create/read/update/archive/restore/transfer sequences.
- [ ] The complete approved role/action matrix has allow and deny contract tests.
- [ ] Viewers receive `403` for every mutation; unauthenticated callers receive the approved `401` behavior.
- [ ] Disabled/deleted users and revoked auth versions lose access immediately.
- [ ] Owners cannot orphan a sheet through membership changes, ownership transfer, or user deletion.
- [ ] Invalid IDs, enums, dates, lengths, unknown sensitive fields, origin, and content types fail consistently.
- [ ] OAuth state is one-time, expiring, bound to server-held context, and safe against replay.
- [ ] Session cookies meet the approved Secure/HttpOnly/SameSite/Path policy.
- [ ] Exhausted, expired, or canceled invites cannot provision a user under competing attempts.
- [ ] Private task/note reads and mutations match the M0 matrix.
- [ ] Logs/errors/audit records exclude secrets and unapproved private content.
- [ ] Fresh Opus adversarial review has no open P0/P1.

## Required evidence

- Schema diagram and migration/check output.
- Machine-readable or tabular authorization test matrix.
- OAuth/session sequence with test IDs, not secrets.
- Competing invite test result and documented platform limitations.
- Adversarial review findings and dispositions.
- API error examples with synthetic values.

## QA approach

Codex independently tests horizontal and vertical privilege changes, stale sessions, direct API calls with hidden UI ignored, source/destination task moves, owner transfer failure injection, invite boundary conditions, and private-field access. Tests should prefer generated users/IDs and synthetic content.

The review session uses Opus 4.8 `xhigh`. `max` is allowed only for a specific unresolved invariant/race after the normal review produces conflicting evidence.

## Rollback

Redeploy the prior isolated staging Worker and restore/recreate the staging D1 database. Database rollback must follow the tested restore procedure; Worker rollback alone is insufficient after schema changes.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M2-E1 | Schema/repository correctness | Pending | Pending | Codex |
| M2-E2 | Authorization matrix | Pending | Pending | Codex |
| M2-E3 | OAuth/session lifecycle | Pending | Pending | Codex |
| M2-E4 | Invite atomicity | Pending | Pending | Codex |
| M2-E5 | Adversarial review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M2-D1 | — | Pending: M0 permission/lifecycle decisions | Brian | Authorization contract |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M2-R1 | P0 | Authorization or private-field exposure | Central policy + exhaustive denial tests | Claude | Open |
| M2-R2 | P1 | Invite race exceeds capacity | Atomic operation and competing test | Claude | Open |
| M2-R3 | P1 | Schema change cannot be safely restored | Staging restore rehearsal | Claude | Open |

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

