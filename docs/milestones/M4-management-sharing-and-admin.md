# M4 — Management, Sharing, and Administration

**Status:** Not Started  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `xhigh` permission review  
**Estimated focused time:** 5–7 days  
**Production impact:** Isolated private-feature staging release

## Outcome

Deliver the management capabilities required for approved users to operate Dash2 without returning to V1: sheet lifecycle, memberships, ownership, curated preferences, invitations, user administration, recovery, and auditable overrides.

## Prerequisites

- M3 is Accepted.
- M0 sharing, lifecycle, retention, admin-override, and phone/tablet priority decisions are approved.

## In scope

- Create, rename, archive, restore, approved purge, and ownership transfer for sheets.
- Add/change/revoke viewer and editor memberships.
- User-specific sheet order/visibility and curated global/device preferences.
- Admin user state/role, ownership recovery, invite administration, and approved account-deletion workflow.
- Audit events for membership, ownership, admin, recovery, and destructive actions.
- Clear confirmation, consequence, recovery, and error UI.
- Desktop/tablet management behavior and approved phone support.
- Contract, browser, permission, invariant, and audit tests.

## Out of scope

- Public dashboards, anonymous display sessions, production migration, and optional post-launch product features.
- Admin impersonation unless explicitly added to launch scope.
- Permanent deletion that bypasses approved retention/recovery policy.
- UI-only authorization.

## Work packets

### M4.1 — Sheet lifecycle

Implement lifecycle UI/actions and recovery. Prevent ownerless states and clarify downstream task/member consequences before confirmation.

### M4.2 — Membership and ownership

Implement existing-user sharing, default role, role changes, revocation, and atomic transfer. Test source and target eligibility and concurrent/stale requests.

### M4.3 — Preferences

Expose only approved settings. Validate server-backed values and keep device display choices distinct from global task/dashboard preferences.

### M4.4 — Administration and invites

Implement user enable/disable/role state, invitation lifecycle, owned-sheet disposition, recovery, and required audit events. Administrative UI must clearly identify high-impact actions.

### M4.5 — Permission/audit review

Use fresh Opus `xhigh` context to attempt horizontal/vertical privilege escalation, owner orphaning, stale membership writes, audit omission, and recovery bypass.

## Acceptance criteria

- [ ] All lifecycle and sharing actions are authorized on the server with direct deny-path tests.
- [ ] No user removal, role change, membership revoke, sheet archive/delete, or failed transfer can create an ownerless sheet.
- [ ] New shares use the approved default role; role changes take effect immediately.
- [ ] A user cannot move a task across sheets unless rights satisfy the M0 matrix in both sheets.
- [ ] Archived sheets/tasks are recoverable within the approved window and excluded/included consistently.
- [ ] Destructive confirmations identify object, impact, and recovery/purge consequences.
- [ ] Device preferences do not overwrite global preferences and contain no private task data.
- [ ] Admin and access-sensitive actions create complete, redacted audit events.
- [ ] Disabled users, removed members, and changed roles lose access without session expiry delay.
- [ ] Required management workflows pass on desktop/tablet and the approved phone baseline.
- [ ] Fresh Opus review has no unresolved P0/P1.

## Required evidence

- Lifecycle state-transition tests.
- Role/action matrix delta covering management actions.
- Owner invariant query/test after success and injected failure.
- Audit-event catalog with synthetic examples.
- Browser recordings/screenshots for destructive and recovery paths.
- Preference-scope/persistence test.

## QA approach

Codex tests as viewer, editor, owner, admin, disabled user, removed member, transferring owner, and recipient. It calls APIs directly, alters stale client state, forces failed transfer/member mutations, and verifies audit and recovery results.

Opus focuses on authorization, invariant preservation, confused-deputy/admin override, audit completeness, and destructive recovery—not cosmetic redesign.

## Rollback

Redeploy the prior staging application and follow the tested D1 restore/forward-fix procedure. Never assume Worker rollback reverses management data changes.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M4-E1 | Sheet/member lifecycle | Pending | Pending | Codex |
| M4-E2 | Ownership invariant | Pending | Pending | Codex |
| M4-E3 | Admin/audit behavior | Pending | Pending | Codex |
| M4-E4 | Device/global preferences | Pending | Pending | Codex |
| M4-E5 | Opus permission review | Pending | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M4-D1 | — | Pending: management launch slice | Brian | Scope gate |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M4-R1 | P0 | Ownership/access escalation | Atomic service operations + adversarial tests | Claude | Open |
| M4-R2 | P1 | Destructive action lacks recovery | Retention and restore tests | Claude | Open |
| M4-R3 | P1 | Admin action is unaudited | Required audit assertion per action | Claude | Open |

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

