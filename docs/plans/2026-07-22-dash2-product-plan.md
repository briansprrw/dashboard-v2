# Dash2 Product Plan

**Product:** Dashboard V2 (`dash2.dnky.us`)
**Status:** Reconciled to approved M0 decisions (2026-07-23)
**Date:** 2026-07-22 (reconciled 2026-07-23)
**Purpose:** Decide what the product should do before implementation begins

> **M0 reconciliation (2026-07-23).** Brian's approved decisions ([M0-D1..D24](../milestones/M0-approved-decisions-2026-07-23.md)) and the [Launch Contract](../milestones/M0.3-launch-contract-2026-07-23.md) govern this document. Where the prose below still reads as an open proposal, the approved decision and the [source reconciliation](../milestones/M0.1-source-reconciliation-2026-07-23.md) take precedence. Key overrides applied inline: the product term is **List** (not Sheet); ordinary deletion is a **recycle bin** (not archive); **public dashboards, usernames, invites/onboarding, search, filters, selectable sort, multiple dashboards, and dedicated smart-frame sessions are deferred to V2.1**; the site and all future public output are permanently `noindex`; V1 shares/settings/invite codes are **not** migrated; layout is **automatic 1–3 column within device-local min/max bounds, with a provisional safety fallback subject to M3 evidence**; and Admin operations are separated from owner-only private task/note/history visibility. See the Launch Contract for the authoritative scope, role matrix, and acceptance IDs.

## How to review this document

Each feature below shows one final priority. Brian's explicit priority overrides are used where provided; otherwise the recommended priority is final.

Priority expresses value; release assignment controls implementation timing. Any feature marked `Release: V2.1 — out of scope for V2` must not appear in V2 work packets even when its priority is Critical or Important.

- **Critical** — Dash2 cannot launch without it.
- **Important** — Should be in the first release unless it threatens the launch.
- **Nice to Have** — Valuable, but safe to add after launch.
- **Not Important** — Exclude unless the product direction changes.

The recommendation is deliberately selective. Existing behavior does not receive automatic parity merely because it exists today.

## Product definition

Dash2 is an always-available, glanceable task dashboard for individuals and small trusted groups. It should answer three questions within a few seconds and without interaction:

1. What needs attention now?
2. What is coming next?
3. Which area of work does each task belong to?

Dash2 is not primarily a project-management suite. Its center of gravity is a high-density status display that also supports fast task maintenance when interaction is needed.

## Product goals

1. **Preserve at-a-glance comprehension.** Color, status icon, task name, due date, priority, notes indicator, and grouping must remain recognizable at a distance.
2. **Use the available screen efficiently.** The application must be useful in the right third of a 1920×1080 desktop, full-screen on a monitor, and on phones, tablets, and Android smart frames.
3. **Make display density intentional.** A first-class Glance mode should remove management chrome and decorative spacing without requiring browser fullscreen.
4. **Use one responsive behavior model.** Desktop, mobile, tablet, and display devices must share the same workflows and domain behavior.
5. **Make permissions understandable.** Owners, editors, viewers, and administrators must have explicitly different capabilities.
6. **Protect private information by design.** Admin authority must not expose private tasks, notes, or task-history field values.
7. **Reduce product baggage.** Reintroduce current settings and administrative features only when they support a real use case.
8. **Permit safe migration.** Approved users, roles, List ownership, and tasks can be transformed into a new schema while V1 shares, settings, and invite codes are deliberately omitted and counted.

## Non-goals for the first release

- Recreating Google Sheets or a general-purpose spreadsheet.
- Competing with full project-management products such as Jira, Asana, or Monday.
- Offline task editing and conflict resolution.
- Real-time multi-user cursors or collaborative document editing.
- Native iOS or Android applications.
- Reproducing every current setting.
- Supporting arbitrary custom task fields in the first release.
- Maintaining API compatibility with the existing dashboard.
- Public dashboards/usernames, invite onboarding/management, dedicated smart-frame sessions, search, filters, selectable sort, and multiple dashboards; these are V2.1 or backlog work, not V2.
- Cryptographic or owner-key protection against direct database/infrastructure access; V2 enforces privacy at the application layer and V2.1 owns the cryptographic change.

## Design principles

### Glance before interaction

The default task display optimizes recognition, not decoration. Large type, strong row colors, stable icon positions, short dates, and consistent grouping are product features rather than styling details.

### Density is a mode, not a device assumption

Viewport width alone must not determine whether the user gets a dense dashboard or a management interface. A narrow desktop panel may need a denser presentation than a large tablet. Users can select a presentation mode, and the layout then adapts within it.

### One task, one visual grammar

Every task row uses the same information order:

```text
[status] [task name........................] [note] [due date] [priority]
```

At narrower widths, optional metadata disappears in a defined order, but the status, task name, due state, and priority remain recognizable.

### Color is important but never the only signal

The screenshot's colored task bars are central to the experience. Status icons, date labels, text treatment, and accessible names must duplicate the meaning so color-blind users and low-quality displays retain the same information.

### Management stays out of the way

Creation, editing, sharing, settings, and administration should be quickly reachable but should not permanently consume dashboard space.

## Target contexts and layout behavior

- **Narrow desktop column**
  - One dense task column, large readable clock/date, minimal gutters, hidden management toolbar, and persistent scroll position.
- **Full desktop screen**
  - Automatic one-to-three-column List layout within the device-local min/max bounds, generous task-name space, and management controls that do not dominate the page.
- **Phone**
  - One-column task list, touch-safe controls, and task details in a bottom sheet or full-height panel. There is no separate mobile feature implementation.
- **iPad/tablet**
  - One or two columns based on usable width and chosen density. Touch and keyboard are both supported.
- **Android smart frame**
  - The normal authenticated responsive app in Glance mode, with oversized type, automatic refresh, and no hover dependency. Dedicated read-only/kiosk sessions are V2.1.
- **Wall/ambient display**
  - The authenticated default dashboard with configurable clock visibility and wake-safe dark appearance. Auto-rotation and multiple dashboards are V2.1.

## Presentation modes

### 1. Glance mode

This is the spiritual successor to the current screenshot and a launch-critical design target.

- Removes navigation chrome, descriptive labels, and nonessential controls.
- Keeps a compact menu affordance and optional floating create button for authenticated editable views.
- Makes date/time prominent when enabled.
- Uses nearly all horizontal space for task information.
- Supports adjustable row height and overall scale.
- Remembers the user's mode per device.
- Can be entered without browser fullscreen.
- Can optionally request browser fullscreen separately when the device supports it.
- Maintains live refresh and a visible stale/offline indicator.

### 2. Standard mode

- Adds clear navigation, approved view controls, and management affordances. Search, filters, and selectable sort are V2.1.
- Uses comfortable spacing while retaining the same color-and-icon task grammar.
- Serves as the primary editing and organization experience.

### 3. Manage mode

- Used for sheet management, sharing, settings, and administration.
- May use tables, forms, and side panels that are inappropriate for a passive display.
- Always has an obvious return to the dashboard.

## Core concepts

- **User:** An authenticated person with a profile, preferences, and memberships.
- **Dashboard:** A user's selected arrangement of sheets for a specific viewing purpose. A user has a default dashboard and may later create additional ones.
- **List:** A named collection of tasks with one owner and zero or more members. (Approved term, M0-D2. "Sheet" survives only as the storage table name and in V1/migration references.)
- **Task:** A unit of work belonging to exactly one sheet.
- **Membership:** A user's owner, editor, or viewer relationship to a sheet.
- **Public profile/public dashboard (V2.1):** Deferred read-only public projection; permanently `noindex` when implemented.
- **Invite (V2.1):** Deferred controlled onboarding mechanism.
- **Device-local settings (V2):** Glance mode, scale, clock, due-band thresholds, min/max column bounds, and visible Lists stored locally. Named/synchronized display profiles are V2.1.

## Roles and permissions

### Viewer

- Can view assigned sheets and tasks.
- Cannot create, edit, move, recycle, restore, or delete tasks.
- Cannot manage a sheet, its members, ownership, or public visibility.

### Editor

- Has all viewer capabilities.
- Can create and edit tasks.
- Can move tasks within a sheet.
- Can move tasks between Lists only when they are an editor or owner of both.
- Can recycle tasks (send to the recycle bin), but cannot restore or permanently delete them (M0-D5).
- Cannot rename Lists, manage members, transfer ownership, configure public inclusion, or delete Lists.

### Owner

- Has all editor capabilities for the owned sheet.
- Can restore and permanently delete recycled tasks according to the approved retention policy.
- Can rename, recycle, restore, and permanently delete the List.
- Can add or revoke existing-user members and change viewer/editor roles.
- Can transfer ownership.

### Admin

- Can manage users, global roles, recovery, ownership, and allowlisted administrative metadata.
- Can perform authorized opaque recovery/purge operations, but is not implicitly an owner/editor and cannot use Admin role to read or mutate protected task content.
- Administrative authority does not grant protected-content visibility: Admin cannot read private tasks, private notes, or task-history field values. Recovery/purge operates by opaque identity and allowlisted metadata.
- Administrative overrides must create an audit event.

**Rules requiring approval:**

- An owner can never remove their own membership without transferring ownership.
- Every sheet must have exactly one valid owner.
- An account recycle/purge must transfer or recycle owned Lists before the user is removed.
- New shares default to viewer.
- Administrators can override ownership/recovery state for support, with an audit entry, without receiving protected content.

## Feature inventory for prioritization

### A. Dashboard and at-a-glance display

- [ ]  **A1. Colored task rows** — Preserve strong due-state/status colors similar to the existing dashboard.
  - Priority: **Critical**
- [ ]  **A2. Stable row information layout** — Status icon, task name, note marker, due date/TBD, and priority icon retain predictable positions.
  - Priority: **Critical**
- [ ]  **A3. Section grouping** — Group tasks by sheet with collapsible section headings.
  - Priority: **Critical**
- [ ]  **A4. Glance mode** — Chrome-free, pixel-efficient display mode independent of browser fullscreen.
  - Priority: **Critical**
- [ ]  **A5. Date and clock** — Large configurable date/time header suitable for a side monitor or smart frame.
  - Priority: **Important**
- [ ]  **A6. Adjustable scale and density** — Increase/decrease global scale and choose compact, standard, or large row density per device.
  - Priority: **Critical**
- [ ]  **A7. Automatic refresh** — Refresh in the background and show stale/offline state without clearing visible tasks.
  - Priority: **Critical**
- [ ]  **A8. Remember display state** — Remember mode, scale, section collapse, visible sheets, and scroll preference per device.
  - Priority: **Important**
- [ ]  **A9. Automatic bounded column flow** — Automatically choose one to three columns within local min/max settings; the minimum may yield temporarily at unsafe widths pending M3 evaluation.
  - Priority: **Important**
- [ ]  **A10. Hide dashboard controls** — Auto-hide or minimize controls in Glance mode.
  - Priority: **Critical**
- [ ]  **A11. Theme presets** — Dark default plus high-contrast and light options.
  - Priority: **Important**
- [ ]  **A12. Custom colors and emoji** — Limited, validated customization rather than dozens of unconstrained settings.
  - Priority: **Important**
  - Notes: Freeform emojis, but colors shifted into Themes instead.
- [ ]  **A13. Multiple saved dashboards** — Different arrangements such as Work, Home, and Smart Frame.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **A14. Kiosk/display link** — Read-only device-specific link or session for a trusted household display.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **A15. Sheet auto-rotation** — Rotate through selected sheets on an ambient display.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**

### B. Task management

- [ ]  **B1. Create task** — Fast creation with sheet, name, status, priority, due date, notes, and flags.
  - Priority: **Critical**
- [ ]  **B2. Edit task** — Edit all supported fields from keyboard, pointer, or touch.
  - Priority: **Critical**
- [ ]  **B3. Recycle task** — Recoverable removal from active views (30-day recycle bin).
  - Priority: **Critical**
- [ ]  **B4. Permanent deletion** — Explicit secondary action, limited by role and retention policy.
  - Priority: **Important**
- [ ]  **B5. Move task** — Move between sheets when permissions allow it.
  - Priority: **Critical**
- [ ]  **B6. Status** — Not started, in progress, pending, blocked, complete, and cancelled.
  - Priority: **Critical**
- [ ]  **B7. Priority** — Low, medium, high, and urgent.
  - Priority: **Critical**
- [ ]  **B8. Due date or TBD** — Dates are optional; undated work is shown as TBD.
  - Priority: **Critical**
- [ ]  **B9. Notes** — Private task details shown through a clear indicator.
  - Priority: **Critical**
- [ ]  **B10. Emoji flags** — Small user-selectable markers for additional visual meaning.
  - Priority: **Important**
- [ ]  **B11. Quick complete** — One gesture, click, or keyboard action to complete a task.
  - Priority: **Important**
- [ ]  **B12. Undo recent action** — Provide a 10-second Undo action after quick-complete, move, or recycle.
  - Priority: **Important**
- [ ]  **B13. Task history** — Record material changes and actor/time.
  - Priority: **Important**
- [ ]  **B14. Search** — Search task names and, where authorized, notes.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **B15. Sort per sheet** — Due date, priority, status, name, or manual ordering.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
  - Notes: Prior to this, keep current logic: Urgent first always. Then sort by date, then short by importance, then alphabetically
- [ ]  **B16. Filters** — Urgent, overdue, open, closed, undated, or selected status.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **B17. Manual reordering** — Drag or keyboard reorder tasks within a sheet.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **B18. Bulk actions** — Select multiple tasks to update, move, or recycle.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**
- [ ]  **B19. Recurring tasks** — Generate future instances from a defined cadence.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**
- [ ]  **B20. Subtasks** — Child checklist/tasks associated with a parent.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**
- [ ]  **B21. Tags** — Cross-sheet labels and filters.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**
- [ ]  **B22. Attachments** — Files or links attached to tasks.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**

### C. Sheets, dashboards, and sharing

- [ ]  **C1. Create, rename, and recycle List** — Owner-managed List lifecycle.
  - Priority: **Critical**
- [ ]  **C2. Sheet ordering** — User-specific order within a dashboard.
  - Priority: **Critical**
- [ ]  **C3. Show or hide sheet** — User chooses which accessible sheets appear on a dashboard.
  - Priority: **Critical**
- [ ]  **C4. Owner/editor/viewer memberships** — Explicit access roles enforced by the API.
  - Priority: **Critical**
- [ ]  **C5. Sharing management** — Owners add existing users, choose roles, and revoke access.
  - Priority: **Critical**
- [ ]  **C6. Ownership transfer** — Safe transfer that cannot create an ownerless sheet.
  - Priority: **Important**
- [ ]  **C7. Multiple dashboards** — Reuse sheets in multiple saved arrangements.
  - Priority: **Not Important**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **C8. Dashboard sharing** — Share an authenticated dashboard arrangement with selected users.
  - Priority: **Not Important**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **C9. Sheet templates** — Create a sheet from a reusable configuration.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**

### D. Accounts and authentication

- [ ]  **D1. Google sign-in** — Continue Google OAuth with server-side sessions.
  - Priority: **Critical**
- [ ]  **D2. Migrated approved accounts** — Only migrated active V1 users can create a V2 session; invite onboarding is V2.1.
  - Priority: **Critical**
- [ ]  **D3. Invite codes** — Capacity-limited, expiring or cancelable invitations with atomic redemption.
  - Priority: **Important**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **D4. Session management** — Secure, sliding sessions with immediate revocation after user removal or role change.
  - Priority: **Critical**
- [ ]  **D5. Profile basics** — Use Google-provided display name/avatar and browser-derived locale/timezone; V2 has no profile editor or public username.
  - Priority: **Important**
  - Release: **V2**
- [ ]  **D6. Active sessions list** — Let users view and revoke their devices.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **D7. Additional identity providers** — Microsoft, Apple, or passwordless login.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**

### E. Public dashboards — V2.1 deferred

All public-output features below are out of scope for V2 regardless of priority. E3.5 private tasks and E8 permanent noindex enforcement are V2 protection requirements, not public-output launch features.

- [ ]  **E1. Public username** — Unique, normalized, reserved-word-aware public path such as `/brian`.
  - Priority: **Important**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E2. Public enable or disable** — Public output is off until the owner explicitly enables it.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E3. Select public sheets** — Owner chooses which owned sheets appear publicly.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E3.5.  Tasks should be able to be marked as Private**
  - Priority: **Important**
  - Release: **V2**
  - Notes: Private tasks should be viewable only to List owners, not editors, viewers, Admin, or public users.
- [ ]  **E4. Public field allowlist** — Default output includes task name, display status, priority, due date, and public sheet name only.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E5. Notes private by default** — Notes, internal IDs, emails, timestamps, and internal slugs never appear publicly.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
  - Notes: Should be viewable to editors and viewers of sheet unless note is marked private.
- [ ]  **E6. Public preview** — Authenticated owner previews exactly what an anonymous visitor will see.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E7. Immediate revocation** — Disabling a profile or sheet removes it from public responses immediately.
  - Priority: **Critical**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E8. Permanent noindex enforcement** — Every Dash2 surface, including any future public output, remains `noindex`; no user, owner, or administrator control may enable search-engine indexing.
  - Priority: **Critical**
  - Release: **V2**
- [ ]  **E9. Public theme and layout** — Limited choice of theme, density, clock, and included fields.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E10. Secret unlisted link** — Opaque non-indexed URL separate from the public username.
  - Priority: **Nice to Have**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **E11. Public subscriptions or feeds** — Read-only calendar or RSS/JSON feed.
  - Priority: **Not Important**
  - Release: **V2.1 backlog — out of scope for V2**

### F. Settings and personalization

- [ ]  **F1. Device display profile** — Mode, scale, density, clock, due-band thresholds, min/max column bounds, and visible dashboard saved locally per device.
  - Priority: **Critical**
- [ ]  **F2. User task preferences** — Completed-task retention and date formatting follow the user globally; device-specific display choices do not overwrite them.
  - Priority: **Important**
  - Release: **V2 launch** (sort/filter defaults deferred to V2.1)
- [ ]  **F3. Curated visual settings** — Validated color palette and status/priority icon choices.
  - Priority: **Important**
- [ ]  **F4. Configurable refresh interval** — Safe bounded interval with a sensible default.
  - Priority: **Important**
  - Notes: 60s default, 10s min, 10 mins max
- [ ]  **F5. Closed-task visibility** — Hide complete/cancelled immediately or after a bounded number of days.
  - Priority: **Important**
  - Notes: Complete and cancelled should be separate config options
- [ ]  **F6. Reduced motion** — Honor system preference and allow explicit override.
  - Priority: **Important**
- [ ]  **F7. Arbitrary CSS or color strings** — Carry forward unrestricted styling values.
  - Priority: **Not Important**
- [ ]  **F8. Every legacy setting** — Preserve all current settings regardless of usage.
  - Priority: **Not Important**

### G. Administration and operations

- [ ]  **G1. User list and role management** — Add, deactivate, promote, or remove users safely.
  - Priority: **Critical**
- [ ]  **G2. User detail** — Admin sees account state, global role, last activity, owned Lists, and memberships, never private task/note/history content.
  - Priority: **Important**
- [ ]  **G3. Sheet recovery and ownership** — Transfer ownership and recover orphaned content.
  - Priority: **Critical**
- [ ]  **G4. Invite management** — Create, inspect, expire, and cancel invites.
  - Priority: **Important**
  - Release: **V2.1 — out of scope for V2**
- [ ]  **G5. Audit log** — Record administrative, ownership, sharing, and public-visibility changes.
  - Priority: **Important**
- [ ]  **G6. Read-only user emulation** — Preview another user's dashboard without mutating it.
  - Priority: **Nice to Have**
- [ ]  **G7. System health view** — Show deployment version, migration version, recent API errors, and data checks.
  - Priority: **Nice to Have**

### H. Reliability, accessibility, and security

- [ ]  **H1. Runtime validation** — Validate every API input, field length, enum, date, and identifier.
  - Priority: **Critical**
- [ ]  **H2. Database invariants** — Foreign keys, checks, uniqueness, and ownership rules where practical.
  - Priority: **Critical**
- [ ]  **H3. Typed API contracts** — Client and server share explicit request and response schemas.
  - Priority: **Critical**
- [ ]  **H4. Authorization matrix tests** — Verify every role against every protected action.
  - Priority: **Critical**
- [ ]  **H5. Browser workflow tests** — Cover sign-in state, task CRUD, sharing, display modes, privacy denials, and recovery.
  - Priority: **Critical**
- [ ]  **H6. Responsive visual tests** — Cover narrow desktop, 1080p, phone, iPad, and smart-frame sizes.
  - Priority: **Critical**
- [ ]  **H7. Keyboard operation** — Core task and navigation flows do not require a pointer.
  - Priority: **Important**
- [ ]  **H8. Screen-reader semantics** — Meaningful landmarks, labels, live states, and dialog focus.
  - Priority: **Important**
- [ ]  **H9. Security headers** — CSP-compatible frontend, HSTS, frame protection, nosniff, and referrer policy.
  - Priority: **Critical**
- [ ]  **H10. Backup and restore rehearsal** — Demonstrate recovery before production migration.
  - Priority: **Critical**

- [ ]  **H11. Cloudflare edge abuse and DDoS hardening** — Beyond the V2 launch baseline, evaluate and configure appropriate Cloudflare rate limiting, WAF/abuse controls, alerting, and cost safeguards for the deployed plan without exposing private request content.
  - Priority: **Important**
  - Release: **V2.1 backlog — out of scope for V2**

## Task display specification

### Required row information

1. **Status icon:** fixed left column; recognizable independent of color.
2. **Task name:** receives all remaining flexible width; truncates only after priority information is protected.
3. **Notes indicator:** shown only when notes exist; opens details for authorized users.
4. **Due label:** short date such as `7/22`, relative label if later approved, or `TBD`.
5. **Priority icon:** fixed right column.
6. **Due-state color:** overdue, today, soon, soonish, future, complete, and unscheduled use visually distinct treatments. Soon/soonish/future day thresholds are locally configurable, ordered, bounded, and non-overlapping.

### Responsive metadata order

When horizontal space is constrained, information compresses in this order:

1. Remove decorative spacing.
2. Shorten date formatting.
3. Collapse notes text to an icon.
4. Reduce task-name font within the selected scale floor.
5. Move lower-priority metadata into task details.

Status, task name, due-state meaning, and priority must never disappear from the active dashboard row.

### Glance mode target

The reference screenshot is an acceptance reference, not a pixel-perfect template. Dash2 should preserve:

- Black/dark background with high contrast.
- Large date/time header.
- Uppercase, compact section labels.
- Edge-to-edge colored rounded task bars.
- Status icons in a stable left rail.
- Due dates and priority icons aligned on the right.
- Minimal vertical gaps and no permanent navigation rail.
- A small menu and unobtrusive create affordance.

Modernization should improve consistency, focus, safety, and responsiveness without making the screen look like a generic card-based productivity application.

## Core workflows

### Daily glance

1. Open or wake the display.
2. Restore the device's selected dashboard, Glance mode, scale, and collapsed sections.
3. Show cached content immediately when safe, then refresh.
4. Visually prioritize overdue/today/urgent work.
5. Display a non-disruptive stale indicator if refresh fails.

### Create a task

1. Activate the create button or keyboard shortcut.
2. Default to the current/most recently used editable sheet.
3. Require only a task name; all other fields are optional/defaulted.
4. Save optimistically only when failure can be clearly reversed.
5. Place the task according to the current sheet sort policy.

### Complete a task

1. Use the quick action or edit panel.
2. Record completion time and actor.
3. Keep it visible or hide it according to user preference.
4. Offer a 10-second Undo window.

### Share a sheet

1. Owner selects an existing user.
2. Owner chooses viewer or editor; viewer is the default.
3. The UI explains the exact abilities before confirmation.
4. The change is logged and effective immediately.

### Publish a dashboard (V2.1 — out of scope for V2)

1. User claims an available public username.
2. User enables public access.
3. User selects owned sheets and allowed public fields.
4. Preview shows the anonymous result using the actual public API.
5. User publishes; response headers and page metadata continue to enforce `noindex` with no enable-indexing control.
6. User can revoke the entire page or individual sheets immediately.

## Product policies requiring explicit decisions

Fill these in before implementation begins.

### P1. Product term: Sheet vs List

- Proposed default: Keep **Sheet** for migration familiarity; reconsider after the prototype.
- **Approved decision (M0-D2):** Use **List** as the canonical user-facing term. "Sheet" remains only as a storage/table identifier and in V1/migration references.

### P2. Can editors delete or archive tasks?

- Proposed default: Editors can archive; owners and admins can permanently delete.
- **Approved decision (M0-D3/D5):** Editors may **recycle** tasks. Only the List **owner** (and Admin) may restore or permanently delete an individual recycled task.

### P3. Closed-task retention

- Proposed default: Keep indefinitely, hide by user preference, and archive after a configurable period.
- **Approved decision (M0-D5):** Closed tasks stay live and are governed by **visibility** controls (complete and cancelled are separate hide / N-days / always options). Deletion is a separate 30-day **recycle-bin** path, not archival aging.

### P4. Sheet deletion

- Proposed default: Soft-delete for 30 days before permanent purge.
- **Approved decision (M0-D5):** Recycle a List with Windows folder semantics — List and all contained tasks/history move and restore as one unit; 30-day window; owner/admin early purge with confirmation.

### P5. Task deletion

- Proposed default: Archive first; permanent deletion is available from the archive.
- **Approved decision (M0-D5):** Recycle first (recycle bin, not archive). Editor recycles; owner/admin restore or permanently delete; permanent delete purges the task and its history.

### P6. Default share role

- Proposed default: Viewer.
- **Approved decision (M0-D3):** New List shares default to **Viewer**.

### P7. Existing `can_see=1` migration

- Proposed default: Migrate existing non-owner shares to editor to preserve capability, then allow owners to reduce access.
- **Approved decision (M0-D3/D13 — overrides the proposed default):** V1 sharing/access-control rows are **not migrated**. Users deliberately re-share Lists in V2 (new shares default to Viewer).

### P8. Public notes

- Proposed default: Never public in the Dash2 launch.
- **Approved decision (M0-D7):** Notes are **never** public. Public output as a whole is deferred to V2.1.

### P9. Public search indexing

- Proposed default: Disabled.
- **Approved decision (M0-D7):** The entire site is `noindex` unconditionally; users are never offered an indexing control.

### P10. Public username changes

- Proposed default: Allowed with a cooldown; reserve the prior name temporarily.
- **Approved decision (M0-D7):** Deferred (V2.1). Public usernames are not in V2. When introduced, a username is set during profile setup; users cannot self-change it and no redirects are provided; an authorized backend operator may correct it.

### P11. Admin override

- Proposed default: Allowed and always audited.
- **Approved decision (M0-D16; supersedes the content-access portion of M0-D6):** V2 Admin has administrative/recovery God Mode but cannot read private tasks, private notes, or task-history field values. Sensitive actions/overrides are **audited**. Cryptographic/owner-key protection against direct database or infrastructure access is deferred to V2.1.

### P12. Multiple dashboards

- Proposed default: Defer until the default-dashboard experience is proven.
- **Approved decision (M0-D2):** Deferred. V2 launches with exactly **one dashboard** per user.

### P13. Smart-frame authentication

- Proposed default: Long-lived, revocable display session that is read-only by default.
- **Approved decision (M0-D7/D10):** Dedicated smart-frame display sessions/profiles are **deferred (V2.1)**. Smart-frame-sized layouts must still render at launch. Launch uses ordinary 30-day sliding sessions.

### P14. Wide-screen layout

- Proposed default: User-selectable one- or two-column sections.
- **Approved decision (M0-D8/D24 — overrides the proposed default):** Layout flows **automatically** from one to three columns based on available width, through 1920×1080, within local minimum/maximum bounds (default 1–3). There is no fixed-count selector or binary toggle. The maximum is firm; provisionally, the minimum may yield at unsafe widths and must be evaluated at the M3 visual gate. Portrait-desktop and ultrawide layouts are future scope.

### P15. Offline behavior

- Proposed default: Show the last successful in-memory data read with a timestamp; do not allow offline writes.
- **Approved decision (M0-D10):** On connectivity loss, keep the current in-memory dashboard visible, label it `Offline`, and disable edits. No private task content is persisted for page-reload offline use. Offline validity ends at the locally known session/token expiry.

## Launch definition

> The authoritative launch scope, non-goals, role matrix, and acceptance IDs now live in the [M0.3 Launch Contract](../milestones/M0.3-launch-contract-2026-07-23.md). The list below is reconciled to it.

Dash2 is ready for launch when:

- A migrated user can sign in at the launch host and see the correct Lists and tasks.
- The narrow desktop-column layout (420 and 640 × 1080) is at least as glanceable and space-efficient as the reference screenshot.
- The same task workflows pass on desktop, phone, iPad-sized, and smart-frame-sized viewports.
- Owner/editor/viewer/admin permissions (including private-task/note visibility) are enforced by the API and covered by tests.
- The site is unconditionally `noindex`; there is **no** public output at launch (public dashboards are deferred to V2.1).
- Existing production data has been migrated twice successfully in rehearsal and reconciles by counts and sampled content, with **no formal V1 write freeze** required (single-user coordinated pause).
- The old dashboard remains available and unchanged as a fallback during the validation window.
- Backup, rollback, and session-revocation procedures have been tested. (Public-revocation rehearsal moves to V2.1 with public output.)
- No Critical launch feature in the Launch Contract remains incomplete.

## Success measures

- A user can identify the highest-attention task in under five seconds from the normal viewing distance.
- A task can be created with only a name in two interactions after opening the create control.
- No device class has a separate implementation of task behavior.
- The narrow desktop view shows equal or more useful task information than the current view at the same viewport size.
- Public API contract tests prove private fields are absent.
- Permission tests cover all role/action combinations.
- Migration reconciliation reports no missing users, sheets, memberships, or tasks.
- Common dashboard reads and task mutations feel immediate under normal use; target budgets are defined in the technical architecture.

## Post-launch candidates

These should be reconsidered only after real Dash2 usage:

- Multiple saved dashboards.
- Recurring tasks.
- Bulk editing.
- Tags and cross-sheet search.
- Public/unlisted feeds.
- Email or push reminders.
- Webhooks and integrations.
- Real-time updates.
- Calendar or timeline views.
- Native install/PWA enhancements.
