# M4 — Management, Sharing, and Administration

**Status:** In Progress — M4.1–M4.4 implemented by Claude (uncommitted); Codex QA pass 1 found 9 findings (0 P0/4 P1/5 P2), all addressed in a correction round; re-review pending. M4.5 (Opus `xhigh` adversarial permission review) not yet run. See `.handoffs/M4-handoff.md` for full packet-by-packet and correction-round evidence.  
**Owner:** Brian  
**Implementation lead:** Claude  
**PM/QA:** Codex  
**Primary model:** Claude Sonnet 5, `high` effort  
**Review model:** Claude Opus 4.8, `xhigh` permission review  
**Estimated focused time:** 5–7 days  
**Production impact:** Isolated private-feature staging release

## Outcome

Deliver the management capabilities required for approved users to operate Dash2 without returning to V1: List lifecycle, memberships, ownership, curated preferences, user administration, recovery, and auditable overrides.

## Prerequisites

- M3 is Accepted.
- M0 sharing, lifecycle, retention, admin-override, and phone/tablet priority decisions are approved.

## In scope

- Create, rename, recycle, restore, approved purge, and ownership transfer for Lists.
- Add/change/revoke viewer and editor memberships.
- User-specific sheet order/visibility and curated global/device preferences.
- Admin user state/role, ownership recovery, and approved account-recycle/purge workflow.
- Audit events for membership, ownership, admin, recovery, and destructive actions.
- Opaque Admin recovery/purge operations that do not reveal private task fields, private notes, or task-history field values.
- Admin user detail limited to account state, global role, last activity, owned Lists, and memberships.
- Clear confirmation, consequence, recovery, and error UI.
- Desktop/tablet management behavior and approved phone support.
- Contract, browser, permission, invariant, and audit tests.

## Out of scope

- Public dashboards, anonymous display sessions, production migration, and optional post-launch product features.
- Admin impersonation unless explicitly added to launch scope.
- Permanent deletion that bypasses approved retention/recovery policy.
- UI-only authorization.
- Invite issuance, redemption, and management (V2.1).

## Work packets

### M4.1 — Sheet lifecycle

Implement lifecycle UI/actions and recovery. Prevent ownerless states and clarify downstream task/member consequences before confirmation.

### M4.2 — Membership and ownership

Implement existing-user sharing, default role, role changes, revocation, and atomic transfer. Test source and target eligibility and concurrent/stale requests.

### M4.3 — Preferences

Expose only approved settings. Validate server-backed values and keep device display choices distinct from global task/dashboard preferences.

### M4.4 — Administration and recovery

Implement user enable/disable/role state, owned-List disposition, recovery, and required audit events. Administrative UI must clearly identify high-impact actions.

### M4.5 — Permission/audit review

Use fresh Opus `xhigh` context to attempt horizontal/vertical privilege escalation, owner orphaning, stale membership writes, audit omission, and recovery bypass.

## Acceptance criteria

- [ ] All lifecycle and sharing actions are authorized on the server with direct deny-path tests.
- [ ] No user removal, role change, membership revoke, List recycle/purge, or failed transfer can create an ownerless List.
- [ ] New shares use the approved default role; role changes take effect immediately.
- [ ] A user cannot move a task across sheets unless rights satisfy the M0 matrix in both sheets.
- [ ] Recycled Lists/tasks are recoverable within the approved window and excluded/included consistently.
- [ ] Destructive confirmations identify object, impact, and recovery/purge consequences.
- [ ] Device preferences do not overwrite global preferences and contain no private task data.
- [ ] Admin recovery and purge succeeds where authorized without granting Admin read access to private tasks, private notes, or task-history field values; administrative audit metadata remains allowlisted.
- [ ] Admin user-detail DTO/UI includes only approved account/List/membership metadata and excludes private task/note/history content.
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

Codex tests as viewer, editor, owner, admin, disabled user, removed member, transferring owner, and recipient. It calls APIs directly, alters stale client state, forces failed transfer/member mutations, verifies audit and recovery results, and confirms Admin can perform authorized opaque recovery without receiving private task/note/history fields.

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
| M4-D1 | 2026-07-30 | Management launch slice: implement M4.1–M4.4 in full this session (lifecycle, membership/ownership, preferences, administration/recovery). Resolved by Brian's direct instruction ("Implement M4.0-4.4... step through those 4 without stopping") rather than a standalone scope discussion. | Brian | Scope gate — unblocked implementation of all four packets in one pass. |
| M4-D2 | 2026-07-30 | No user directory or search exists in V2 (no username until V2.1; V1 not yet migrated). A List owner identifies a share/ownership-transfer target by their **exact email** through a narrow `POST /users/lookup` endpoint — no partial search, no listing/directory. | Brian | Resolves how M4.2's membership/ownership UI names a target user without introducing a directory-disclosure surface. Implemented as `UserDirectoryService`/`toUserLookupDto` (id + display name only, never the target's own email, role, or state; a disabled/recycled account answers 404 identically to no account at all). |
| M4-D3 | 2026-07-30 | M4.3 in-scope wording ("curated global/device preferences") conflicts with M0's approved record ("V2 display preferences are stored locally on the browser/device and are not synchronized to the user profile"; synchronized profiles are V2.1). Resolved: **one narrow server-backed exception** — a user's own sheet order and per-List hidden/visible state — stored via the existing `user_preferences` table. Every other display preference (theme, zoom, density, due bands, column bounds, refresh interval, clock, emoji, closed-task visibility, collapse state) remains fully device-local exactly as M3.3 built it. | Brian | Narrows M4.3 to a scoped exception rather than a general synced-profile system, keeping M0 §7/§11's V2.1 boundary intact. |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M4-R1 | P0 | Ownership/access escalation | Atomic service operations + adversarial tests | Claude | Open |
| M4-R2 | P1 | Destructive action lacks recovery | Retention and restore tests | Claude | Open |
| M4-R3 | P1 | Admin action is unaudited | Required audit assertion per action | Claude | Open |

## PM/QA Sign-off

```text
Claude status: Ready for re-review (M4.1–M4.4 implementation, plus a correction round
  addressing all nine findings from Codex's pass-1 QA review — M4-QA-01 through M4-QA-09,
  0 P0 / 4 P1 / 5 P2 at the time of that review). M4.5 Opus xhigh adversarial review has not
  run and is still required before this milestone can exit — see M4-R1.
Claude handoff date: 2026-07-31 (.handoffs/M4-handoff.md — four implementation packet
  sections plus a correction-round section with per-finding disposition and evidence)
Codex review: Pass 1 complete (Changes Requested, 2026-07-30); re-review pending
Open P0/P1: 0 self-identified after the correction round; M4-R1 (P0, ownership/access
  escalation) remains Open pending M4.5's adversarial pass against the new account-purge
  cascade and the M4-QA-02 stale-authority-write fix specifically
Brian decision: Pending
Decision date: —
Notes: Nothing committed. M4.1 added GET /sheets/recycled. M4.2 added POST /users/lookup
  (M4-D2) plus membership/ownership UI. M4.3 added the narrowed sheet-order/visibility
  preference (M4-D3) plus GET/PUT /users/me/sheet-preferences. M4.4 added account purge
  (cascades to every owned List), admin List purge, admin user-detail, and admin audit-log
  read routes, plus an admin UI panel. The correction round added: a List-creation UI
  (M4-QA-01, previously entirely missing); an owner-guarded compare-and-set write path for
  membership grant/revoke/ownership-transfer against a concurrent transfer (M4-QA-02); an
  admin-only exact-email lookup that can find disabled/recycled accounts (M4-QA-03); member
  display names and a role-change control (M4-QA-04); a combined serialized-size guard for
  sheet preferences at both the request and service layers (M4-QA-05); last-activity and
  named List/membership rendering in the admin detail view (M4-QA-06); a distinct
  `sheet.membership.role_changed` audit action with previous/new role (M4-QA-07, alongside
  M4-QA-02); cursor-based audit pagination with no duplication/omission across pages,
  including tied timestamps (M4-QA-08); and a per-actor rate limit on the sharing email
  lookup (M4-QA-09). Known gaps unchanged from before the correction round: no dedicated UI
  for the admin List-recovery bin or the audit log (both exist as tested API endpoints
  only) — a product call for Brian before milestone exit.
```
