# M0 Approved Decision Record — 2026-07-23

**Milestone:** M0 — Product and Architecture Decisions  
**Decision owner:** Brian  
**Recorded by:** Codex  
**Status:** Approved input to the M0 launch contract  
**Authority:** Brian's explicit decisions in the 2026-07-23 M0 readiness task

> **Privacy revision — 2026-07-23.** Brian subsequently approved the stricter V2 boundary recorded below: administrators retain administrative and recovery authority but cannot read private tasks, private notes, or task-history field values. Cryptographic/owner-key protection is deferred to V2.1. This revision supersedes the earlier temporary V2 administrator-content exception wherever it appeared in this record.

This record preserves the product and architecture decisions Brian made during the M0 readiness review. These decisions override conflicting proposals, recommendations, mockup assumptions, audits, and V1 behavior. M0.3 must reconcile the canonical product and architecture plans to this record without changing its meaning.

## 1. Priority and interpretation rules

- Brian's entered feature-priority overrides are approved as written.
- Every remaining `Unrated` feature inherits its listed recommended priority unless this record explicitly defers or changes it.
- Notes Brian added to feature entries are requirements or constraints, not informal commentary.
- Product requirement E3.5, private tasks, is approved as **Important**.
- Explicit scope decisions in this record take precedence over an inherited feature priority. In particular, public dashboards and dedicated smart-frame access are deferred to V2.1 even where individual underlying features were recommended for V2.

## 2. Product language and launch boundary

- The canonical user-facing term is **List**, not Sheet. “Sheet” is V1/GAS-era terminology and must not remain in the V2 product language except in historical or migration references.
- V2 launches with exactly one dashboard per user. Multiple saved dashboards are backlogged.
- Public username dashboards are V2.1 scope.
- Dedicated smart-frame sessions and synchronized display profiles are V2.1 scope.
- Supported external/developer API access is V2.1 scope. V2 may use private internal HTTP endpoints for its own browser application.
- V2 supports only users migrated from V1. V2 does not create new accounts through invite codes or other onboarding.
- Public username selection waits until V2.1. A username is selected during the relevant account/profile setup. Users cannot change it themselves, and username redirects are not provided. An authorized backend operator may correct a username directly.

## 3. Roles, sharing, and privacy

### Viewer

- May read Lists and non-private tasks granted through membership.
- May read ordinary task notes.
- Cannot create, edit, move, recycle, restore, permanently delete, share, or manage Lists or tasks.

### Editor

- Has Viewer access.
- May create and edit tasks.
- May move a task only when the Editor has edit authority on both the source and destination Lists.
- May send tasks to the recycle bin.
- Cannot restore or permanently delete recycled tasks.
- Cannot manage List membership, ownership, lifecycle, or public configuration.

### List owner

- Has Editor access for the owned List.
- May manage List membership and ownership.
- May restore or permanently delete individual recycled tasks.
- May recycle, restore, or permanently delete an owned List.
- May view full task history for the owned List.
- Is the only ordinary user who may view private tasks and private notes.

### Administrator

- V2 administrators have administrative “god mode” over accounts, roles, Lists, memberships, ownership, recycle operations, recovery, and purge.
- Administrative authority does **not** grant content visibility: administrators cannot read private tasks, private notes, or task-history field values.
- Administrators may perform authorized restore/purge operations using opaque object identity and allowlisted administrative metadata without receiving the protected content.
- Sensitive administrative actions and overrides must be audited.
- Cryptographic/owner-key protection that prevents direct database or infrastructure operators from reading protected content is deferred to V2.1. V2 privacy is enforced at the application authorization, query, DTO, history, and audit boundaries.

### Sharing

- New List shares default to Viewer.
- V1 sharing/access-control rows are not migrated. Users must deliberately re-share Lists in V2.
- Public access is separate from authenticated List membership.
- Disabled or recycled users cannot authenticate or use memberships.

### Private tasks and notes

- V2 includes private tasks and private notes.
- A private task is hidden from Viewers, Editors, and administrators and visible only to its List owner through the application.
- A private note is hidden from Viewers, Editors, and administrators while the non-private task fields remain visible; only the List owner may view it through the application.
- Private tasks are excluded from public output unless a future, explicit product decision changes that rule.
- Task names, notes, and task-history values are private application content and must not appear in general logs, fixtures, screenshots, prompts, or milestone evidence.

## 4. Recycle-bin and recovery lifecycle

- V2 uses the term and behavior **recycle bin**, not archive, for ordinary user deletion.
- Tasks, Lists, and accounts remain recoverable for 30 days and are eligible for automatic permanent purge after that period.
- Eligible recycled content may be permanently deleted before the 30-day expiry only by the object-specific actor defined below and only after explicit confirmation.

### Tasks

- Editors may send a task to the recycle bin.
- The List owner or an administrator may restore or permanently delete an individual recycled task. An administrator performs the action without reading protected task content or task-history field values.
- Recycling and restoring a task preserves its task history.
- Permanently deleting a task purges the task and its task history.

### Lists

- Recycling a List follows Windows recycle-bin folder semantics: the List and all tasks/history contained within it move and restore as one unit.
- A List owner or administrator may restore a recycled List.
- A List owner or administrator may permanently delete a recycled List early, which permanently deletes its contained tasks and task history.

### Accounts

- Account removal is an administrator-controlled recycle operation, not immediate hard deletion or V2 self-service deletion.
- Recycling an account disables authentication and soft-deletes the account together with every List and task it owns.
- Viewer/Editor memberships held by the account are suspended and restored with the account.
- Lists owned by the recycled account disappear for all other members until the account is restored.
- One administrator action restores the account, owned Lists/tasks/history, and suspended memberships as a unit.
- One explicitly confirmed administrator action may permanently delete the entire recycled account unit early.
- An administrator may restore tasks as part of whole-account recovery and may perform authorized individual restore/purge operations through an opaque administrative recovery surface that does not expose protected content.

## 5. Task history and administrative audit

- Task-history field values are visible only to the List owner. Administrators may see only allowlisted administrative metadata needed to operate and audit recovery; they cannot read task-history before/after values or other protected history fields.
- It records actor, time, action, changed fields, and complete before/after values, including task names and notes, comparable to Smartsheet history.
- Task history is private content and uses authorization policies separate from ordinary task reads.
- History survives task/List/account recycle and restore, and is purged with the permanently deleted task.
- Administrative/security audit is a separate event stream for role changes, ownership changes, membership changes, account/List recycle and restore, permanent purge, public configuration, and administrative overrides.
- Administrative audit metadata must be allowlisted. General operational logs and shareable evidence must not contain task names, notes, task-history values, credentials, OAuth material, invite tokens, cookies, session identifiers, or other private content.
- A permanent purge may leave an opaque administrative record that a purge occurred, without retaining purged task content.

## 6. Public behavior and indexing

- Public dashboards are deferred to V2.1.
- Task notes are never public under the approved direction.
- The entire Dash2 site must be marked `noindex`; users are never offered a control to enable search-engine indexing.
- Future public output must use a dedicated allowlist projection rather than filtering a private DTO.
- Public username collisions and reserved application-route names must be prevented when V2.1 is designed.

## 7. Responsive layout, devices, themes, and icons

### Layout and device coverage

- Lists automatically flow from one to two or three columns based on available window/container width, following the coded mockup. There is no fixed-column selector; M0-D24 later adds device-local min/max bounds around the automatic choice.
- Layout responds continuously when the window changes size.
- V2 is required through 1920×1080 and includes desktop, phone, and tablet behavior from one responsive implementation.
- Phone and tablet portrait remain V2 requirements. Portrait desktop/monitor layouts and ultrawide layouts are future scope.
- Narrow visual acceptance includes both 420×1080 and 640×1080.
- Smart-frame-sized layouts must render correctly in V2, but dedicated frame authentication, profiles, and emoji/image fallback are V2.1.
- Per-device zoom uses seven steps from −3 through +3 at 10% per step.

### Device-local preferences

- V2 display preferences are stored locally on the browser/device and are not synchronized to the user profile.
- Local preferences may include presentation mode, zoom/scale, density, theme, clock/date visibility, refresh interval, collapsed Lists, and similar non-sensitive display choices.
- Private task content is not persisted in local storage or cookies.

### Themes and icons

- Built-in theme **Dark** is the V1-style solid-row appearance.
- Built-in theme **Darker** uses the translucent row/button treatment shown in the mockup.
- V2 also includes **Light** and **High Contrast** themes.
- Users may create custom themes through validated color controls. Arbitrary CSS is prohibited.
- Status and priority meanings use semantic identifiers, but their displayed emoji remain customizable per local device profile.
- Each theme supplies defaults; a user may retain the defaults or choose their own emoji.
- Future profiles may select SVG/image renderers or an emoji/image toggle without migrating the underlying status or priority meaning.

## 8. Refresh, offline behavior, and sessions

- The approved refresh note applies: 60 seconds by default, bounded from 10 seconds to 10 minutes.
- On connectivity loss, the current in-memory dashboard remains visible, displays `Offline`, and disables edits.
- Offline mode keeps the dashboard alive only until the locally known session/token expiry.
- Private dashboard/task content is not persisted for page-reload offline use.
- Ordinary sessions use 30-day sliding expiration.
- Disabling or recycling an account causes immediate server-side revocation; an offline client learns revocation when it reconnects.
- Dedicated long-lived, revocable, read-only display sessions are V2.1. Their approved profile controls include selected Lists and order, private-task inclusion, refresh timing, clock/date visibility, and theme.

## 9. Architecture and isolation

- Dash2 is fully greenfield and independent of V1.
- It uses this separate repository, its own Cloudflare Worker, D1 database, KV namespace, OAuth callback, hostname, and deployment path.
- Dash2 initially runs at `dash2.dnky.us`. When Brian approves cutover, `dash.dnky.us` moves to the new service.
- V1 behavior, schema, terminology, and implementation are migration inputs only and must not influence V2 product or architecture design.
- The UI uses React and Vite with authored/custom CSS rather than a generic visual component system.
- One Hono Cloudflare Worker serves the application as a modular monolith; separate code modules do not imply separate deployed services.
- The V2 browser communicates with private internal endpoints under `/api/v1` using runtime-validated JSON and explicit DTOs. These endpoints are not a supported third-party API.
- Internal records use application-generated UUIDs.
- `owner_user_id` is the canonical List owner field; Viewer and Editor relationships use separate membership records.
- D1 access uses reviewed SQL migrations and small repository/data-access modules rather than an ORM abstraction.
- KV is limited to opaque sessions and short-lived authentication/flow state unless a later approved feature requires more.

## 10. V1 migration and cutover

- V1 may be inspected with read-only schema and aggregate queries for migration design and reconciliation only if Brian separately authorizes that access during M6; M0 performs no V1 query or profiling.
- M0/M6 evidence must never contain emails, task names, notes, credentials, raw exports, or other private production content.
- The destination V2 model is authoritative. Migration tooling adapts V1 data to V2 and must not carry forward V1 technical debt to simplify migration.
- Migrate current V1 user accounts and global roles.
- Migrate Lists and ownership.
- Migrate all available task information, including names, notes, dates, statuses, priorities, flags, ordering, and valid timestamps, translating legacy values into approved V2 values when necessary.
- Do not migrate V1 sharing permissions, settings/preferences, invite codes, or unrelated legacy configuration.
- Every source record must be accounted for as imported, transformed, intentionally omitted, or rejected with an explanation.
- V1 remains the source of truth while V2 is unstable.
- A V1 write freeze is not required because Brian is the only active V1 user and can coordinate use directly.
- Before stability/cutover, an explicitly authorized V2 database wipe and fresh copy may replace an earlier import. A wipe is never implied and requires Brian's authorization at execution time.
- The final migration is a controlled fresh copy followed by reconciliation. V1 remains unchanged as the rollback source during validation.

## 11. Deferred decisions that do not block V2

- Multiple saved dashboards.
- Public dashboards, public username UX, supported public/developer APIs, and any public cache policy details: V2.1.
- Dedicated smart-frame sessions, synchronized display profiles, and emoji/SVG device fallback: V2.1.
- Cryptographic/owner-key protection against direct database or infrastructure access; application-level Admin denial is already required in V2.
- User-facing public username changes and redirects.
- New-user onboarding and new invite-code issuance.
- Ultrawide and portrait desktop/monitor layouts.
- Enhanced Cloudflare edge-abuse/DDoS hardening beyond the V2 launch security baseline, including evaluation of appropriate rate limiting, WAF/abuse controls, alerting, and cost safeguards for the deployed plan.

## 12. Guided-review decisions — 2026-07-23

### M0 evidence

- Capture sanitized screenshots of the existing coded mockup during M0 as the interim visual baseline at the approved reference viewports. Replace them with application screenshots during M3/M7.
- **Superseded by M0-D25:** M0 must not query or profile V1. Any later live-source profiling requires Brian's separate authorization during M6.

### Priority and release scope

- Priority and release timing are separate fields. A Critical or Important feature may be assigned to V2.1; an explicit `Release: V2.1 — out of scope for V2` controls implementation timing.
- Move deferred-feature workflows and implementation details out of active V2 instructions into clearly labeled V2.1 sections. V2 exclusions must be explicit.

### Launch feature details

- V2 includes a 10-second Undo action after quick-complete, move, and recycle.
- V2 profile basics use the display name and avatar supplied by Google plus browser-derived locale and timezone. V2 has no profile-editing screen; public username remains V2.1.
- The V2 Admin user-detail screen shows account state, global role, last activity, owned Lists, and memberships, but no private tasks, private notes, or task-history field values.
- Synthetic fixtures may contain completely invented emails, task names, and notes needed for migration/validation tests. Real content is prohibited, and fixture values must not be printed in logs or shareable evidence.
- Internal recycle storage uses `recycled_at` and an explicit `recycled` account state rather than archive terminology or overloading `disabled`.
- V2 uses seven semantic due bands. Users may configure the ordered, bounded, non-overlapping day thresholds for soon/soonish/future in local device settings until synchronized settings profiles exist.
- Layout remains automatic, but local settings may specify minimum and maximum column counts from 1–3 (default 1–3). The maximum is firm. Provisionally for V2, the minimum may yield when necessary to preserve safe readability/reflow; M3 must expose and evaluate that behavior rather than treating it as permanent product wisdom.
