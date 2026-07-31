# M4 — Management, Sharing, and Administration

- **Status:** In Progress — see "Current state" below.
- **Owner:** Brian
- **Implementation lead:** Claude
- **PM/QA:** Codex
- **Primary model:** Claude Sonnet 5, `high` effort
- **Review model:** Claude Opus 5, `xhigh` permission review (M4.5)
- **Estimated focused time:** 5–7 days
- **Production impact:** Isolated private-feature staging release

A list rather than trailing-whitespace hard breaks, so `git diff --check` passes
on modified lines (Codex M4-RR2-05).

### Current state

M4.1–M4.4 are committed as `dfa8945`. Four review passes have run against that
base — three independent (Codex) and one Claude self-review (M4.5), which is not
independent QA and does not substitute for it:

1. **Codex QA pass 1** — 9 findings (0 P0/4 P1/5 P2), M4-QA-01..09, all corrected
   inside `dfa8945`.
2. **Codex re-review pass 1** — 5 findings (0 P0/1 P1/3 P2/1 P3), M4-RR-01..05.
3. **M4.5 adversarial permission/audit review** (Claude self-review) — 5 findings
   (0 P0/2 P1/2 P2/1 P3), M4-AR-01..05. M4-AR-01/02 are the same root cause Codex
   independently reported as M4-RR-01.
4. **Codex re-review pass 2** — 5 findings (0 P0/2 P1/2 P2/1 P3), M4-RR2-01..05.

That is **24 finding IDs** in total (9 + 5 + 5 + 5), all addressed. The ID count is
not a count of distinct defects: M4-RR-01 describes the same root cause as
M4-AR-01/02, and M4-RR-05/M4-RR2-05 are successive reports of the same
evidence-accuracy defect. Where a distinct-defect count matters, the specific
overlap is named at that row rather than asserted as a single collapsed total.

Codex re-review pass 3 (2026-07-31) reviewed the uncommitted worktree and
**recommended acceptance** of the M4-RR2-01..05 remediation: 0 P0 / 0 P1 / 0 P2,
with one P3 evidence-count correction (M4-RR3-01), applied here. The corrections
for passes 2–4 remain uncommitted on top of `dfa8945`. A reviewer must read the
**working tree**, not `dfa8945` alone — three test files are untracked, so a
commit-scoped review sees the pre-fix state. See `.handoffs/M4-handoff.md` for
per-finding disposition and evidence.

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

Rows cite evidence that exists in the current worktree. A `Result` stays
unconfirmed until its reviewer verifies it — Claude does not mark its own
evidence accepted.

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M4-E1 | Sheet/member lifecycle | `test/integration/authorization-service.test.ts`, `test/integration/sheet-repository.test.ts`, `test/web/*Dialog.test.tsx` | Implemented and tested. M4-RR-01 remediated and confirmed RESOLVED by Codex re-review pass 3 | Codex |
| M4-E2 | Ownership invariant | `test/integration/m45-permission-review.test.ts` (18 tests): refused-transfer membership integrity, purge-cascade owner guard, atomic rollback on an injected mid-batch failure, ownerless-List sweep returning 0. `test/integration/m4rr2-concurrency.test.ts` (14 tests): target-eligibility race on transfer, stale-owner rename/recycle/restore/purge, duplicate-revoke race. Of those 14, four are controls proving the guards do not break uncontended traffic — one successful control per race block, plus a dedicated admin override control and an owner control in the lifecycle block. Broader role/action coverage lives in `test/integration/authorization-service.test.ts`, not this file | Confirmed by Codex re-review pass 3 (M4-RR2-01..03 RESOLVED) | Codex |
| M4-E3 | Admin/audit behavior | `test/integration/m45-permission-review.test.ts` (no audit row after a refused write; admin override records `ownerUserId` + `adminOverride`; metadata excludes List names); `test/integration/m4rr2-concurrency.test.ts` (one audit row per real revocation; no row for a refused lifecycle write); `test/contract/admin-audit-page.test.ts` (10 tests, pagination below/at/above cap) | Confirmed by Codex re-review pass 3 (M4-RR2-01..03 RESOLVED) | Codex |
| M4-E4 | Device/global preferences | `test/integration/authorization-service.test.ts` preference-scope and serialized-size blocks; `test/web/use-sheet-preferences.test.ts` | Codex re-review verified M4-QA-05 resolved | Codex |
| M4-E5 | Opus permission review | M4.5 run 2026-07-31 in a fresh `claude-opus-5` context at `xhigh` effort (effort confirmed by Brian, M4-D4); 5 defects reproduced (M4-AR-01..05) and remediated with regression tests; see the M4.5 section of `.handoffs/M4-handoff.md` | Model and effort requirement **satisfied** per M4-D4, closing Codex M4-RR2-04. Codex re-review pass 3 independently confirmed the review's remediation (M4-AR-01..05 resolved as scoped; M4-RR2-01..03 resolved) | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M4-D1 | 2026-07-30 | Management launch slice: implement M4.1–M4.4 in full this session (lifecycle, membership/ownership, preferences, administration/recovery). Resolved by Brian's direct instruction ("Implement M4.0-4.4... step through those 4 without stopping") rather than a standalone scope discussion. | Brian | Scope gate — unblocked implementation of all four packets in one pass. |
| M4-D2 | 2026-07-30 | No user directory or search exists in V2 (no username until V2.1; V1 not yet migrated). A List owner identifies a share/ownership-transfer target by their **exact email** through a narrow `POST /users/lookup` endpoint — no partial search, no listing/directory. | Brian | Resolves how M4.2's membership/ownership UI names a target user without introducing a directory-disclosure surface. Implemented as `UserDirectoryService`/`toUserLookupDto` (id + display name only, never the target's own email, role, or state; a disabled/recycled account answers 404 identically to no account at all). |
| M4-D3 | 2026-07-30 | M4.3 in-scope wording ("curated global/device preferences") conflicts with M0's approved record ("V2 display preferences are stored locally on the browser/device and are not synchronized to the user profile"; synchronized profiles are V2.1). Resolved: **one narrow server-backed exception** — a user's own sheet order and per-List hidden/visible state — stored via the existing `user_preferences` table. Every other display preference (theme, zoom, density, due bands, column bounds, refresh interval, clock, emoji, closed-task visibility, collapse state) remains fully device-local exactly as M3.3 built it. | Brian | Narrows M4.3 to a scoped exception rather than a general synced-profile system, keeping M0 §7/§11's V2.1 boundary intact. |
| M4-D5 | 2026-07-31 | **Admin recovery-bin and audit-log viewer screens are deferred to the backlog; M4 ships without them.** Both capabilities exist and are tested as API endpoints only — an administrator recovering another user's List, or reading the administrative/security log, needs a developer to run the operation rather than clicking a button. Brian's decision: "backlog it, ship without that screen." Not scheduled to a specific milestone; Brian schedules it. | Brian | Closes the last open M4 scope question besides device evidence. Accepted tradeoff: administrative recovery and audit inspection are not self-service at launch. Ordinary users are unaffected — they already have their own List recycle-bin screen. Risk is availability/convenience, not security or data loss: the underlying operations are authorization-tested and audited. |
| M4-D4 | 2026-07-31 | The M4.5 adversarial permission/audit review ran at Opus `xhigh`, confirmed by Brian. This closes Codex finding M4-RR2-04 and satisfies M4's `xhigh` review-model requirement for M4-E5. Brian additionally set a standing rule: agents verify the **model** for a milestone's model/effort routing and do not block, flag, or hold evidence on the effort setting, which is not observable from inside a session. | Brian | Unblocks M4-E5. Prevents a recurring unresolvable gate: effort is a session configuration only Brian can see, so requiring in-session proof of it would make every model/effort routing requirement permanently unverifiable. Model remains verifiable and is still recorded in every handoff. |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M4-R1 | P0 | Ownership/access escalation | Atomic service operations + adversarial tests. M4.5 plus two Codex re-review passes raised **7 finding IDs** here — M4-AR-01, M4-AR-02, M4-AR-03, M4-RR-01, M4-RR2-01, M4-RR2-02, M4-RR2-03 — covering **6 distinct defects**, since M4-RR-01 is the same root cause as M4-AR-01/02. All corrected with real-D1 race regressions in `test/integration/m45-permission-review.test.ts` and `test/integration/m4rr2-concurrency.test.ts` | Claude | Open — all defects raised against this risk are confirmed fixed by Codex re-review pass 3; the row closes at Brian's milestone acceptance, not by Claude |
| M4-R2 | P1 | Destructive action lacks recovery | Retention and restore tests; account-purge cascade now owner-guarded (M4-AR-03) and List purge conditioned on write-time ownership (M4-RR2-02) | Claude | Open — all defects raised against this risk are confirmed fixed by Codex re-review pass 3; the row closes at Brian's milestone acceptance |
| M4-R3 | P1 | Admin action is unaudited | Required audit assertion per action, plus the inverse: a refused action must write no audit row (M4-AR-01, M4-RR2-03) and an administrative override must be identifiable after the target row is deleted (M4-AR-04) | Claude | Open — all defects raised against this risk are confirmed fixed by Codex re-review pass 3; the row closes at Brian's milestone acceptance |

## PM/QA Sign-off

```text
Claude status: Ready for re-review (third pass). M4.1–M4.4 are committed as dfa8945. M4.5
  (Opus adversarial permission/audit review) has run — see M4-E5 and the M4.5 section of
  .handoffs/M4-handoff.md. Two corrective rounds sit uncommitted on top of dfa8945: the
  first addressing Codex re-review pass 1 (M4-RR-01..05) plus M4.5's own findings
  (M4-AR-01..05), the second addressing Codex re-review pass 2 (M4-RR2-01..05 —
  M4-RR2-01/02/03/05 by code and documentation changes, M4-RR2-04 by Brian's M4-D4
  confirmation rather than by code).
Claude handoff date: 2026-07-31 (.handoffs/M4-handoff.md — one section per implementation
  packet, per Codex review pass, and per Claude correction round, each with per-finding
  disposition and evidence. Deliberately not given a section count: every appended section
  invalidates it, which is how the last stale count got there.)
Codex review: Pass 1 QA complete (Changes Requested, 2026-07-30). Re-review pass 1 complete
  (Changes Requested, 2026-07-31, M4-RR-01..05). Re-review pass 2 complete (Changes
  Requested, 2026-07-31, M4-RR2-01..05). Re-review pass 3 complete (2026-07-31, scoped to
  M4-RR2-01..05 against the uncommitted worktree) — **recommends acceptance** of that
  remediation: 0 P0 / 0 P1 / 0 P2 / 1 P3 (M4-RR3-01, evidence-count precision), now applied.
Open P0/P1: 0. Codex pass 3 independently confirmed M4-RR2-01, -02, -03 RESOLVED and
  M4-RR2-04 RESOLVED by owner decision (M4-D4). M4-R1/R2/R3 stay Open in the Risk Log:
  every defect raised against them to date is confirmed fixed, but a risk row closes at
  milestone acceptance, which is Brian's call — Claude does not close its own P0 row.
Brian decision: Pending
Decision date: —
Notes: Nothing from the correction rounds is committed. M4-RR2-04 closed by M4-D4 (Brian
  confirmed Opus `xhigh`). The admin recovery-bin/audit-log UI question is closed by M4-D5
  (backlogged; M4 ships API-only). One open item remains: live device/browser evidence, which
  Brian has asked to obtain by deploying to a reachable hostname — see the M4 deployment gate
  in .handoffs/M4-handoff.md. That work is a separate production-mutation gate, not part of
  this correction packet.
```
