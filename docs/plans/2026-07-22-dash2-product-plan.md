# Dash2 Product Plan

**Product:** Dashboard V2 (`dash2.dnky.us`)
**Status:** Proposal for product review
**Date:** 2026-07-22
**Purpose:** Decide what the product should do before implementation begins

## How to review this document

Every feature is now a plain Markdown checklist item. Replace `Unrated` on the **Your priority** line with one of the ratings below. Change `[ ]` to `[x]` after reviewing that feature.

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
5. **Make permissions understandable.** Owners, editors, viewers, administrators, and public visitors must have explicitly different capabilities.
6. **Protect private information by design.** Public dashboards expose only deliberately selected sheets and fields.
7. **Reduce product baggage.** Reintroduce current settings and administrative features only when they support a real use case.
8. **Permit safe migration.** Existing users, sheets, tasks, sharing, settings, and invite information can be transformed into a new schema without making the old schema permanent.

## Non-goals for the first release

- Recreating Google Sheets or a general-purpose spreadsheet.
- Competing with full project-management products such as Jira, Asana, or Monday.
- Offline task editing and conflict resolution.
- Real-time multi-user cursors or collaborative document editing.
- Native iOS or Android applications.
- Reproducing every current setting.
- Supporting arbitrary custom task fields in the first release.
- Maintaining API compatibility with the existing dashboard.

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
  - One wide column or optional two-column sheet layout, generous task-name space, and management controls that do not dominate the page.
- **Phone**
  - One-column task list, touch-safe controls, and task details in a bottom sheet or full-height panel. There is no separate mobile feature implementation.
- **iPad/tablet**
  - One or two columns based on usable width and chosen density. Touch and keyboard are both supported.
- **Android smart frame**
  - Glance mode by default, oversized type, automatic refresh, optional read-only/kiosk behavior, and no hover dependency.
- **Wall/ambient display**
  - Optional auto-rotation or fixed selected dashboard, configurable clock visibility, wake-safe dark appearance, and no confidential controls on screen.

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

- Adds clear navigation, view controls, filters, and management affordances.
- Uses comfortable spacing while retaining the same color-and-icon task grammar.
- Serves as the primary editing and organization experience.

### 3. Manage mode

- Used for sheet management, sharing, settings, and administration.
- May use tables, forms, and side panels that are inappropriate for a passive display.
- Always has an obvious return to the dashboard.

## Core concepts

- **User:** An authenticated person with a profile, preferences, and memberships.
- **Dashboard:** A user's selected arrangement of sheets for a specific viewing purpose. A user has a default dashboard and may later create additional ones.
- **Sheet:** A named collection of tasks with one owner and zero or more members. This may be renamed to **List** during product review.
- **Task:** A unit of work belonging to exactly one sheet.
- **Membership:** A user's owner, editor, or viewer relationship to a sheet.
- **Public profile:** A reserved public username and public-dashboard configuration owned by a user.
- **Public dashboard:** A read-only projection containing explicitly selected sheets and task fields.
- **Invite:** A controlled way to allow a new account to sign in.
- **Display profile:** Per-device presentation choices such as Glance mode, scale, clock, and visible sheets.

## Roles and permissions

### Viewer

- Can view assigned sheets and tasks.
- Cannot create, edit, move, archive, or delete tasks.
- Cannot manage a sheet, its members, ownership, or public visibility.

### Editor

- Has all viewer capabilities.
- Can create and edit tasks.
- Can move tasks within a sheet.
- Can move tasks between sheets only when they are an editor or owner of both.
- Proposed: can archive tasks, but cannot permanently delete them.
- Cannot rename sheets, manage members, transfer ownership, configure public inclusion, or delete sheets.

### Owner

- Has all editor capabilities for the owned sheet.
- Can archive and permanently delete tasks according to the approved retention policy.
- Can rename, archive, restore, and delete the sheet.
- Can invite or revoke members and change viewer/editor roles.
- Can transfer ownership.
- Can configure public inclusion for the sheet.

### Admin

- Can perform all task and sheet actions.
- Can manage users, roles, invitations, recovery, ownership, and public configuration.
- Administrative overrides must create an audit event.

**Rules requiring approval:**

- An owner can never remove their own membership without transferring ownership.
- Every sheet must have exactly one valid owner.
- A user deletion must transfer or archive owned sheets before the user is removed.
- New shares default to viewer.
- Public access is separate from authenticated membership.
- Administrators can override access for support and recovery, with an audit entry.

## Feature inventory for prioritization

### A. Dashboard and at-a-glance display

- [ ]  **A1. Colored task rows** — Preserve strong due-state/status colors similar to the existing dashboard.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A2. Stable row information layout** — Status icon, task name, note marker, due date/TBD, and priority icon retain predictable positions.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A3. Section grouping** — Group tasks by sheet with collapsible section headings.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A4. Glance mode** — Chrome-free, pixel-efficient display mode independent of browser fullscreen.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A5. Date and clock** — Large configurable date/time header suitable for a side monitor or smart frame.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **A6. Adjustable scale and density** — Increase/decrease global scale and choose compact, standard, or large row density per device.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A7. Automatic refresh** — Refresh in the background and show stale/offline state without clearing visible tasks.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A8. Remember display state** — Remember mode, scale, section collapse, visible sheets, and scroll preference per device.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **A9. Full-screen sheet utilization** — Allow one- or two-column section flow on wide screens.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **A10. Hide dashboard controls** — Auto-hide or minimize controls in Glance mode.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **A11. Theme presets** — Dark default plus high-contrast and light options.
  - Recommended priority: **Nice to Have**
  - Your priority: `Important`
- [ ]  **A12. Custom colors and emoji** — Limited, validated customization rather than dozens of unconstrained settings.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
  - Notes: Freeform emojis, but colors shifted into Themes instead.
- [ ]  **A13. Multiple saved dashboards** — Different arrangements such as Work, Home, and Smart Frame.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **A14. Kiosk/display link** — Read-only device-specific link or session for a trusted household display.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **A15. Sheet auto-rotation** — Rotate through selected sheets on an ambient display.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`

### B. Task management

- [ ]  **B1. Create task** — Fast creation with sheet, name, status, priority, due date, notes, and flags.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B2. Edit task** — Edit all supported fields from keyboard, pointer, or touch.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B3. Archive task** — Recoverable removal from active views.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B4. Permanent deletion** — Explicit secondary action, limited by role and retention policy.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **B5. Move task** — Move between sheets when permissions allow it.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B6. Status** — Not started, in progress, pending, blocked, complete, and cancelled.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B7. Priority** — Low, medium, high, and urgent.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B8. Due date or TBD** — Dates are optional; undated work is shown as TBD.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B9. Notes** — Private task details shown through a clear indicator.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **B10. Emoji flags** — Small user-selectable markers for additional visual meaning.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **B11. Quick complete** — One gesture, click, or keyboard action to complete a task.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **B12. Undo recent action** — Recover from complete, move, or archive actions.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **B13. Task history** — Record material changes and actor/time.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **B14. Search** — Search task names and, where authorized, notes.
  - Recommended priority: **Important**
  - Your priority: `Nice to have`
- [ ]  **B15. Sort per sheet** — Due date, priority, status, name, or manual ordering.
  - Recommended priority: **Important**
  - Your priority: `Nice to have`
  - Notes: Prior to this, keep current logic: Urgent first always. Then sort by date, then short by importance, then alphabetically
- [ ]  **B16. Filters** — Urgent, overdue, open, closed, undated, or selected status.
  - Recommended priority: **Important**
  - Your priority: `Nice to have`
- [ ]  **B17. Manual reordering** — Drag or keyboard reorder tasks within a sheet.
  - Recommended priority: **Nice to Have**
  - Your priority: `Nice to have`
- [ ]  **B18. Bulk actions** — Select multiple tasks to update, move, or archive.
  - Recommended priority: **Nice to Have**
  - Your priority: `Not important`
- [ ]  **B19. Recurring tasks** — Generate future instances from a defined cadence.
  - Recommended priority: **Nice to Have**
  - Your priority: `Not important`
- [ ]  **B20. Subtasks** — Child checklist/tasks associated with a parent.
  - Recommended priority: **Not Important**
  - Your priority: `Unrated`
- [ ]  **B21. Tags** — Cross-sheet labels and filters.
  - Recommended priority: **Nice to Have**
  - Your priority: `Not Important`
- [ ]  **B22. Attachments** — Files or links attached to tasks.
  - Recommended priority: **Not Important**
  - Your priority: `Unrated`

### C. Sheets, dashboards, and sharing

- [ ]  **C1. Create, rename, and archive sheet** — Owner-managed sheet lifecycle.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **C2. Sheet ordering** — User-specific order within a dashboard.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **C3. Show or hide sheet** — User chooses which accessible sheets appear on a dashboard.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **C4. Owner/editor/viewer memberships** — Explicit access roles enforced by the API.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **C5. Sharing management** — Owners add existing users, choose roles, and revoke access.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **C6. Ownership transfer** — Safe transfer that cannot create an ownerless sheet.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **C7. Multiple dashboards** — Reuse sheets in multiple saved arrangements.
  - Recommended priority: **Nice to Have**
  - Your priority: `Not important`
- [ ]  **C8. Dashboard sharing** — Share an authenticated dashboard arrangement with selected users.
  - Recommended priority: **Nice to Have**
  - Your priority: `Not important`
- [ ]  **C9. Sheet templates** — Create a sheet from a reusable configuration.
  - Recommended priority: **Not Important**
  - Your priority: `Not important`

### D. Accounts and authentication

- [ ]  **D1. Google sign-in** — Continue Google OAuth with server-side sessions.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **D2. Allowlisted or invited accounts** — Only approved users can create a session.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **D3. Invite codes** — Capacity-limited, expiring or cancelable invitations with atomic redemption.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **D4. Session management** — Secure, sliding sessions with immediate revocation after user removal or role change.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **D5. Profile basics** — Display name, avatar, locale/timezone, and optional public username.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **D6. Active sessions list** — Let users view and revoke their devices.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **D7. Additional identity providers** — Microsoft, Apple, or passwordless login.
  - Recommended priority: **Not Important**
  - Your priority: `Nice to have`

### E. Public dashboards

- [ ]  **E1. Public username** — Unique, normalized, reserved-word-aware public path such as `/brian`.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **E2. Public enable or disable** — Public output is off until the owner explicitly enables it.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **E3. Select public sheets** — Owner chooses which owned sheets appear publicly.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **E3.5.  Tasks should be able to be marked as Private**
  - Priority: `Important`
  - Notes: Private tasks should be only viewable to sheet owners, not other editors, viewers, or public.
- [ ]  **E4. Public field allowlist** — Default output includes task name, display status, priority, due date, and public sheet name only.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **E5. Notes private by default** — Notes, internal IDs, emails, timestamps, and internal slugs never appear publicly.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
  - Notes: Should be viewable to editors and viewers of sheet unless note is marked private.
- [ ]  **E6. Public preview** — Authenticated owner previews exactly what an anonymous visitor will see.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **E7. Immediate revocation** — Disabling a profile or sheet removes it from public responses immediately.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **E8. Search indexing choice** — Owner chooses whether indexing is allowed; default is no-index.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **E9. Public theme and layout** — Limited choice of theme, density, clock, and included fields.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **E10. Secret unlisted link** — Opaque non-indexed URL separate from the public username.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **E11. Public subscriptions or feeds** — Read-only calendar or RSS/JSON feed.
  - Recommended priority: **Not Important**
  - Your priority: `Unrated`

### F. Settings and personalization

- [ ]  **F1. Device display profile** — Mode, scale, density, clock, layout, and visible dashboard saved per device.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **F2. User task preferences** — Sort/filter defaults, completed-task retention, and date formatting follow the user.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **F3. Curated visual settings** — Validated color palette and status/priority icon choices.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **F4. Configurable refresh interval** — Safe bounded interval with a sensible default.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
  - Notes: 60s default, 10s min, 10 mins max
- [ ]  **F5. Closed-task visibility** — Hide complete/cancelled immediately or after a bounded number of days.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
  - Notes: Complete and cancelled should be separate config options
- [ ]  **F6. Reduced motion** — Honor system preference and allow explicit override.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **F7. Arbitrary CSS or color strings** — Carry forward unrestricted styling values.
  - Recommended priority: **Not Important**
  - Your priority: `Unrated`
- [ ]  **F8. Every legacy setting** — Preserve all current settings regardless of usage.
  - Recommended priority: **Not Important**
  - Your priority: `Unrated`

### G. Administration and operations

- [ ]  **G1. User list and role management** — Add, deactivate, promote, or remove users safely.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **G2. User detail** — See owned sheets, memberships, last activity, and account state.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **G3. Sheet recovery and ownership** — Transfer ownership and recover orphaned content.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **G4. Invite management** — Create, inspect, expire, and cancel invites.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **G5. Audit log** — Record administrative, ownership, sharing, and public-visibility changes.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **G6. Read-only user emulation** — Preview another user's dashboard without mutating it.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`
- [ ]  **G7. System health view** — Show deployment version, migration version, recent API errors, and data checks.
  - Recommended priority: **Nice to Have**
  - Your priority: `Unrated`

### H. Reliability, accessibility, and security

- [ ]  **H1. Runtime validation** — Validate every API input, field length, enum, date, and identifier.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H2. Database invariants** — Foreign keys, checks, uniqueness, and ownership rules where practical.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H3. Typed API contracts** — Client and server share explicit request and response schemas.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H4. Authorization matrix tests** — Verify every role against every protected action.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H5. Browser workflow tests** — Cover sign-in state, task CRUD, sharing, display modes, and public preview.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H6. Responsive visual tests** — Cover narrow desktop, 1080p, phone, iPad, and smart-frame sizes.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H7. Keyboard operation** — Core task and navigation flows do not require a pointer.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **H8. Screen-reader semantics** — Meaningful landmarks, labels, live states, and dialog focus.
  - Recommended priority: **Important**
  - Your priority: `Unrated`
- [ ]  **H9. Security headers** — CSP-compatible frontend, HSTS, frame protection, nosniff, and referrer policy.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`
- [ ]  **H10. Backup and restore rehearsal** — Demonstrate recovery before production migration.
  - Recommended priority: **Critical**
  - Your priority: `Unrated`

## Task display specification

### Required row information

1. **Status icon:** fixed left column; recognizable independent of color.
2. **Task name:** receives all remaining flexible width; truncates only after priority information is protected.
3. **Notes indicator:** shown only when notes exist; opens details for authorized users.
4. **Due label:** short date such as `7/22`, relative label if later approved, or `TBD`.
5. **Priority icon:** fixed right column.
6. **Due-state color:** overdue, today, soon, future, completed, and unscheduled use visually distinct treatments.

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
4. Offer a short undo window.

### Share a sheet

1. Owner selects an existing user.
2. Owner chooses viewer or editor; viewer is the default.
3. The UI explains the exact abilities before confirmation.
4. The change is logged and effective immediately.

### Publish a dashboard

1. User claims an available public username.
2. User enables public access.
3. User selects owned sheets and allowed public fields.
4. Preview shows the anonymous result using the actual public API.
5. User publishes; default response headers prevent indexing unless enabled.
6. User can revoke the entire page or individual sheets immediately.

## Product policies requiring explicit decisions

Fill these in before implementation begins.

### P1. Product term: Sheet vs List

- Proposed default: Keep **Sheet** for migration familiarity; reconsider after the prototype.
- Approved decision: `TBD`

### P2. Can editors delete or archive tasks?

- Proposed default: Editors can archive; owners and admins can permanently delete.
- Approved decision: `TBD`

### P3. Closed-task retention

- Proposed default: Keep indefinitely, hide by user preference, and archive after a configurable period.
- Approved decision: `TBD`

### P4. Sheet deletion

- Proposed default: Soft-delete for 30 days before permanent purge.
- Approved decision: `TBD`

### P5. Task deletion

- Proposed default: Archive first; permanent deletion is available from the archive.
- Approved decision: `TBD`

### P6. Default share role

- Proposed default: Viewer.
- Approved decision: `TBD`

### P7. Existing `can_see=1` migration

- Proposed default: Migrate existing non-owner shares to editor to preserve capability, then allow owners to reduce access.
- Approved decision: `TBD`

### P8. Public notes

- Proposed default: Never public in the Dash2 launch.
- Approved decision: `TBD`

### P9. Public search indexing

- Proposed default: Disabled.
- Approved decision: `TBD`

### P10. Public username changes

- Proposed default: Allowed with a cooldown; reserve the prior name temporarily.
- Approved decision: `TBD`

### P11. Admin override

- Proposed default: Allowed and always audited.
- Approved decision: `TBD`

### P12. Multiple dashboards

- Proposed default: Defer until the default-dashboard experience is proven.
- Approved decision: `TBD`

### P13. Smart-frame authentication

- Proposed default: Long-lived, revocable display session that is read-only by default.
- Approved decision: `TBD`

### P14. Wide-screen layout

- Proposed default: User-selectable one- or two-column sections.
- Approved decision: `TBD`

### P15. Offline behavior

- Proposed default: Show the last successful in-memory data read with a timestamp; do not allow offline writes.
- Approved decision: `TBD`

## Launch definition

Dash2 is ready for launch when:

- A migrated user can sign in at `dash2.dnky.us` and see the correct sheets and tasks.
- The narrow desktop-column layout is at least as glanceable and space-efficient as the reference screenshot.
- The same task workflows pass on desktop, phone, iPad-sized, and smart-frame-sized viewports.
- Owner/editor/viewer permissions are enforced by the API and covered by tests.
- Public responses contain only approved fields and public access is off by default.
- Existing production data has been migrated twice successfully in rehearsal and reconciles by counts and sampled content.
- The old dashboard remains available during the validation window.
- Backup, rollback, session revocation, and public revocation procedures have been tested.
- No Critical feature in this document remains incomplete.

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
