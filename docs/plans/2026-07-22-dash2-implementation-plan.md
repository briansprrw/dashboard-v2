# Dash2 Implementation Plan

**Target:** New application at `dash2.dnky.us`  
**Status:** Proposal; implementation begins after product priorities and open decisions are approved  
**Date:** 2026-07-22  
**Related documents:** [Product plan](./2026-07-22-dash2-product-plan.md) · [Technical architecture](./2026-07-22-dash2-technical-architecture.md)

## Delivery strategy

Dash2 will be built as a clean application beside the existing dashboard. The current application remains the production source of truth until Dash2 passes acceptance testing and a final data migration is complete.

The implementation will preserve Cloudflare Workers, D1, KV, Google OAuth, and the operational knowledge gained from the current system. It will not reuse the current frontend, API contracts, or database structure as architectural constraints.

### Guiding rules

1. Product decisions precede schema and UI implementation.
2. Features do not receive automatic parity with Dashboard V1.
3. Dash2 uses a separate Worker, D1 database, KV namespace, OAuth callback, and hostname.
4. The V1 database is read-only to migration tooling.
5. Migration is repeatable and produces a reconciliation report.
6. No dual-write synchronization is planned for launch.
7. The final migration uses a short, announced write freeze or maintenance window.
8. Every milestone is independently testable and leaves the existing application unaffected.

## Assumptions behind the schedule

- One developer working primarily on Dash2 with AI assistance.
- Product decisions are answered within one working day when they block implementation.
- The selected launch scope is close to the recommended Critical/Important set in the product plan.
- Existing Cloudflare and Google OAuth accounts remain available.
- Production data volume is small enough for export, transformation, validation, and import during a short maintenance window.
- No native mobile application, offline writes, or exact legacy-settings parity is required.

## Estimated duration

| Scope | Focused developer time | Likely calendar duration |
|---|---:|---:|
| Ruthless core MVP | 20–25 days | 4–5 full-time weeks |
| Recommended launch | 30–42 days | 6–9 full-time weeks |
| Launch plus optional public/display features | 40–55 days | 8–12 full-time weeks |

The recommended working target is **six to eight focused weeks**, followed by a one- to two-week period where V1 remains available while Dash2 is validated with real use.

## Milestone map

```text
Product approval
      ↓
Foundation and contracts
      ↓
Core domain + permissions
      ↓
Glance dashboard + task workflows
      ↓
Sharing, settings, admin, public view
      ↓
Migration rehearsals + device QA
      ↓
Dash2 launch and validation
      ↓
V1 retirement decision
```

## Phase 0 — Product approval and baseline capture

**Estimate:** 3–5 days  
**Deployment impact:** None

### Objectives

- Approve product priorities and the unresolved policies in the product plan.
- Decide the launch feature boundary.
- Convert the current application into a behavioral reference rather than an architecture reference.
- Capture the current production schema and non-sensitive data characteristics.

### Deliverables

- Product-plan priorities changed from `Unrated` to approved ratings.
- Approved role/action matrix.
- Approved task lifecycle, sheet lifecycle, public-data, and username policies.
- Inventory of current settings with keep/replace/drop decisions.
- Sanitized migration fixture representing users, sheets, access, settings, open tasks, closed tasks, and edge cases.
- Reference screenshots at narrow desktop, 1920×1080, phone portrait, tablet portrait/landscape, and smart-frame sizes.
- V1 contract tests for behavior that must survive migration.

### Exit criteria

- No Critical product-policy field remains `TBD`.
- Every launch feature has acceptance criteria.
- The legacy migration fixture can be created without copying secrets or personal task contents into source control.

## Phase 1 — Repository, environments, and delivery foundation

**Estimate:** 3–4 days  
**Deployment impact:** First non-production Dash2 deployment

### Objectives

- Create the clean Dash2 repository and deployment pipeline.
- Establish strict TypeScript, validation, tests, and repeatable local D1 setup before features accumulate.

### Deliverables

- New repository with Worker/API, web application, shared contracts, migrations, and migration tooling.
- Local, preview, staging, and production configuration.
- Separate Dash2 D1 and KV resources.
- Automated formatting, linting, typechecking, unit tests, and build.
- Preview deployment on a temporary Workers hostname.
- Security-header baseline and structured error responses.
- CI that blocks deployment when required checks fail.

### Acceptance criteria

- A clean checkout can install, create the local database, migrate it, build, test, and run with documented commands.
- Static assets and `/api/*` requests route correctly.
- Secrets are absent from source and logs.
- The test suite proves unauthenticated API rejection and basic health/version reporting.

### Rollback

Delete or ignore the isolated preview deployment. V1 is untouched.

## Phase 2 — Domain model, authentication, and authorization

**Estimate:** 5–7 days  
**Deployment impact:** Staging API becomes usable

### Objectives

- Implement the new schema and core domain rules without UI dependence.
- Preserve the strong parts of the existing Google OAuth and server-side session behavior.

### Deliverables

- Users, identities, sessions, sheets, memberships, tasks, settings/preferences, invites, public profiles, and audit-event migrations.
- Google OAuth with expiring one-time state.
- Secure server-side sessions with explicit local/production cookie configuration.
- Owner/editor/viewer/admin authorization policies.
- Runtime schemas for every implemented request and response.
- Atomic invite reservation/redemption.
- Services and repositories for users, sheets, memberships, and tasks.
- API contract and authorization-matrix tests.

### Acceptance criteria

- Deleted or disabled users lose access immediately.
- Role changes apply without waiting for session expiration.
- Viewers receive `403` for every mutation.
- Owners cannot make a sheet ownerless or remove their own required membership.
- Invalid enum, date, length, identifier, and request shapes receive consistent `400` responses.
- An exhausted or canceled invite cannot provision a user under concurrent attempts.

### Rollback

Redeploy the prior Dash2 Worker version. Restore the isolated staging D1 database if a migration test fails. V1 remains unaffected.

## Phase 3 — Glance dashboard and core task workflows

**Estimate:** 7–10 days  
**Deployment impact:** First end-to-end Dash2 experience

### Objectives

- Prove the defining product experience before building management surfaces.
- Deliver a single responsive task implementation across desktop, mobile, tablet, and smart-frame sizes.

### Deliverables

- Authenticated application shell.
- Standard and Glance presentation modes.
- Large configurable date/time header.
- Responsive sheet sections and task rows.
- Due-state colors, status icons, note marker, short date/TBD, and priority icon.
- Task create, edit, quick complete, archive/delete, and move workflows.
- Sheet ordering, visibility, collapse state, scale, and density preferences.
- Background refresh with stale/offline indication.
- Keyboard, pointer, and touch support from shared components/actions.
- Browser and screenshot tests for the reference viewport matrix.

### Visual acceptance gate

The narrow desktop-column view must be reviewed against the supplied screenshot before the project proceeds. Approval should evaluate:

- Information visible per vertical screen.
- Task-name readability at normal viewing distance.
- Recognition of overdue, today, future, completed, and undated states.
- Alignment and stability of status, date, note, and priority signals.
- Amount of space consumed by controls and margins.
- Whether the result feels like an information display rather than a generic card UI.

### Functional acceptance criteria

- The same browser test performs create/edit/complete/move/archive on every supported viewport project.
- Changing a task once updates every presentation mode.
- Refresh failure never replaces valid visible data with a blank screen.
- Glance mode is restored per device and can be exited without clearing user preferences.

### Rollback

Keep the prior preview deployment available. No production users have been moved.

## Phase 4 — Sheet management, sharing, preferences, and administration

**Estimate:** 5–7 days  
**Deployment impact:** Dash2 reaches private-feature launch parity

### Objectives

- Complete the management capabilities required for V1 users to operate without returning to V1.

### Deliverables

- Create, rename, archive, restore, and transfer sheet ownership.
- Add/revoke viewer and editor memberships.
- Curated settings and per-device display profiles.
- User, role, sheet-recovery, and invite administration.
- Audit events for administrative and access-sensitive actions.
- Clear destructive-action confirmations and recovery paths.

### Acceptance criteria

- Every management action is authorized on the server and audited when required.
- Deleting/deactivating a user cannot orphan a sheet.
- Archived tasks and sheets can be recovered within the approved retention window.
- Device-specific display choices do not overwrite global user task preferences.
- Admin management works on desktop and tablet; phone support meets the approved product priority.

## Phase 5 — Public dashboards and display sessions

**Estimate:** 4–7 days  
**Dependency:** Public features must be approved as launch scope  
**Deployment impact:** Anonymous read surface becomes available in staging

### Objectives

- Provide intentional public or ambient display access without exposing internal records.

### Deliverables

- Public username reservation and reserved-name policy.
- Explicit public enable/disable control.
- Selection of owned sheets for public inclusion.
- Versioned public response DTO.
- Anonymous public dashboard and authenticated exact preview.
- No-index default and bounded cache/revocation behavior.
- Optional revocable, read-only display session if approved.

### Acceptance criteria

- Public contract tests prove that emails, notes, internal IDs, raw slugs, internal timestamps, memberships, and audit information are absent.
- Disabling a profile or removing a sheet stops new public responses within the approved cache window.
- Public paths cannot collide with application routes or reserved names.
- Public preview and anonymous output use the same API projection.
- Public pages remain useful at the smart-frame viewport and do not expose management controls.

### Rollback

Disable the public-route feature flag or public Worker route while leaving private Dash2 features available.

## Phase 6 — Migration development and rehearsals

**Estimate:** 5–8 days, partly overlapping earlier phases  
**Deployment impact:** Staging receives transformed V1 data

### Migration philosophy

The migration converts V1 concepts into V2 concepts. It does not copy tables directly.

### Proposed mapping

| V1 source | Dash2 destination | Transformation |
|---|---|---|
| `allowed_users` | `users`, `identities`, and roles | Normalize email; create stable new user ID; validate role; retain legacy email as identity. |
| `sheets` | `sheets` | Create new stable ID; preserve display name; map owner email to user ID; retain old slug in `legacy_source_id`. |
| `access_control` | `sheet_memberships` | Owner rows become owner; other `can_see=1` rows become the approved migration role, proposed editor. |
| `tasks` | `tasks` | Create new stable ID; map sheet slug to sheet ID; normalize status/priority/date; preserve ordering and timestamps when valid. |
| `settings` | `user_preferences` or discard report | Import only approved keys; parse and validate types; report dropped or invalid values. |
| `invite_codes` | `invites` and redemption records | Import active codes only if approved; validate counts; otherwise archive in migration report. |
| `app_config` | Environment/config defaults | Do not import unused legacy configuration. |

### Migration tooling

The migration command must:

1. Export or read V1 data without mutation.
2. Validate source rows and produce warnings/errors before importing.
3. Create deterministic source-to-destination ID mappings.
4. Import into an empty migrated Dash2 database or a named migration batch.
5. Be idempotent for the same migration batch.
6. Produce counts, rejected rows, transformed values, and referential-integrity results.
7. Never log task notes or other sensitive contents by default.
8. Support a dry run.

### Rehearsal sequence

1. Run against a synthetic fixture containing every known edge case.
2. Run against a sanitized production-shape export.
3. Run against a fresh staging database using a current production export.
4. Let selected users validate counts, permissions, display, and sampled tasks.
5. Correct mapping rules and repeat from a fresh staging database.
6. Complete a second clean rehearsal with no unexplained differences.

### Reconciliation requirements

- User totals by role and state.
- Sheet totals by owner and public state.
- Membership totals by user and sheet.
- Task totals by sheet, status, priority, and open/closed state.
- Undated, invalid-date, orphaned, and duplicate source rows.
- Imported, transformed, intentionally dropped, and rejected setting counts.
- Sampled task names, notes, dates, status, priority, flags, and ordering.
- Foreign-key and ownership invariant checks.

### Acceptance criteria

- Two consecutive imports from the same source produce identical logical results.
- All source records are accounted for as imported, transformed, intentionally skipped, or rejected with an explanation.
- No migrated sheet is ownerless.
- No membership or task references a missing user/sheet.
- Selected users approve their staging data and access.

## Phase 7 — Hardening, device QA, and launch readiness

**Estimate:** 4–6 days  
**Deployment impact:** Production resources created; DNS not yet cut over

### Test matrix

| Dimension | Required coverage |
|---|---|
| Browsers | Current Chromium/Edge; WebKit/Safari; Firefox smoke coverage. |
| Narrow desktop | Right-side column at representative widths and 1080px height. |
| Full desktop | 1920×1080 and one larger high-DPI viewport. |
| Phones | Small and large phone portrait; landscape smoke test. |
| Tablets | iPad-sized portrait and landscape. |
| Smart frame | Representative 1280×800 and 1920×1080 touch/non-hover configurations. |
| Input | Mouse, keyboard-only, touch, and no-hover behavior. |
| Motion/contrast | Reduced motion, high zoom, contrast, and color-independent state checks. |
| Roles | Anonymous, viewer, editor, owner, admin, disabled user. |
| Data | Empty, typical, long names, many sheets/tasks, invalid legacy values, archived content. |

### Hardening work

- Threat review for OAuth, sessions, invitations, public routes, and destructive actions.
- Content Security Policy rollout with no inline event handlers or unsafe dynamic markup.
- Accessibility audit and keyboard/focus correction.
- Query/index review using production-shaped data.
- Error and audit logging with sensitive-data redaction.
- D1 Time Travel/restore procedure and independent export verification.
- Deployment rollback rehearsal; note that Worker rollback does not roll back D1 state.
- Runbook for public disablement, account disablement, migration failure, and V1 fallback.

### Launch gate

- All tests and typechecks pass.
- No unresolved Critical defect.
- No known public-data or authorization defect.
- Visual Glance-mode approval recorded.
- Migration and rollback rehearsals completed.
- DNS, OAuth callback, cookies, security headers, and monitoring verified on `dash2.dnky.us`.

## Phase 8 — Production migration and launch

**Estimate:** 2–4 days including observation  
**Deployment impact:** Dash2 opens to production users

### Launch procedure

1. Announce the V1 write-freeze/maintenance window.
2. Verify a recent D1 recovery point and take an independent export.
3. Put V1 mutations into maintenance mode while retaining a read-only status page if practical.
4. Export V1 data.
5. Run the approved migration into a fresh or cleared Dash2 production database.
6. Run automated reconciliation and invariant checks.
7. Complete a short manual validation with owner, shared-user, admin, and public-preview accounts.
8. Enable `dash2.dnky.us` for approved users.
9. Keep V1 data unchanged and available as a fallback during the validation period.
10. Monitor login, API errors, D1 errors, migration discrepancies, and public-route behavior.

### Rollback criteria

Return users to V1 if any of the following occur and cannot be corrected safely within the launch window:

- Missing or incorrectly assigned sheets/tasks.
- Permission escalation or private-data exposure.
- Authentication/session failure affecting normal use.
- Unrecoverable task-write errors.
- Glance dashboard unusable on the primary narrow-screen installation.

### Rollback procedure

1. Disable Dash2 mutations and public routes.
2. Direct users back to V1.
3. Preserve the Dash2 database for diagnosis; do not merge Dash2 writes into V1 ad hoc.
4. Rehearse a corrected migration using a fresh Dash2 database.
5. Schedule a new cutover.

The simplest safe launch avoids meaningful parallel writes. If users create tasks in Dash2 before rollback, those writes require a reviewed export/reconciliation process rather than automatic reverse migration.

## Phase 9 — Validation and V1 retirement

**Estimate:** 1–2 calendar weeks of normal use; 1–3 focused days  
**Deployment impact:** V1 becomes archived/read-only or is retired

### Activities

- Collect defects and missing-workflow feedback.
- Compare task/user/sheet counts and recent changes.
- Confirm smart-frame, mobile, tablet, narrow desktop, and full-screen behavior in real environments.
- Fix launch defects in Dash2.
- Decide whether any V1-only capability should be added, exported, or intentionally abandoned.
- Archive V1 code and infrastructure only after the recovery window is approved complete.

## Work breakdown suitable for issue tracking

### Epic 1 — Product and design

- Approve feature priorities.
- Approve domain policies.
- Produce low-fidelity responsive layouts.
- Produce Glance-mode visual prototype.
- Validate reference viewport density.

### Epic 2 — Platform

- Scaffold repository and environments.
- Configure Worker static assets/API routing.
- Configure D1/KV/secrets.
- Add CI, quality checks, preview deployment, and headers.

### Epic 3 — Identity and access

- OAuth/state/session lifecycle.
- Users and account states.
- Sheet membership policy.
- Invitations.
- Authorization test matrix.

### Epic 4 — Tasks and sheets

- Task schemas/services/repositories.
- Task CRUD, lifecycle, move, and history.
- Sheet lifecycle and ownership.
- Dashboard ordering/visibility.

### Epic 5 — Responsive experience

- App shell and routing.
- Task row/section primitives.
- Glance mode.
- Standard/manage modes.
- Device preferences.
- Keyboard/touch/accessibility behavior.

### Epic 6 — Sharing and administration

- Owner sharing workflow.
- Admin user/sheet/invite workflows.
- Recovery and audit log.

### Epic 7 — Public dashboards

- Username policy.
- Public configuration and DTO.
- Preview and anonymous rendering.
- Revocation, indexing, and cache tests.

### Epic 8 — Migration and launch

- Source profiling and fixture.
- Transformer/importer.
- Reconciliation report.
- Two staging rehearsals.
- Production cutover and rollback rehearsal.
- Launch and V1 retirement review.

## Key risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Product decisions remain unresolved | Schema/UI churn | Block affected implementation at Phase 0 gate. |
| “Parity” expands silently | Schedule and architecture degradation | Require priority change and acceptance criteria for every added feature. |
| Migration reveals inconsistent source data | Missing or misassigned records | Profile early; deterministic transforms; exception report; two rehearsals. |
| New UI becomes spacious but less glanceable | Product fails its primary use | Approve Glance prototype before management UI; measure density at reference viewport. |
| Permission bug exposes or mutates data | High-severity privacy/integrity failure | Central policy functions plus exhaustive role/action tests. |
| Public route leaks internal fields | Privacy failure | Dedicated DTO, allowlist-only serializer, contract tests, off by default. |
| Worker rollback conflicts with changed database | Extended outage | Forward-safe migrations, separate DB, recovery point/export, explicit DB rollback runbook. |
| Separate device implementations drift | Repetition of V1 debt | One component/action model; viewport-specific CSS and composition only. |
| Smart-frame browser limitations appear late | Display unusable | Test a representative device/browser during Phase 3, not at launch. |

## Approval gates

| Gate | Required approval |
|---|---|
| A — Product | Priorities, non-goals, roles, lifecycle, public policy, terminology. |
| B — Visual direction | Glance-mode narrow viewport and representative responsive layouts. |
| C — Architecture | Stack, schema, API boundary, session model, repository/environment strategy. |
| D — Private beta | Core workflows, permissions, admin essentials, migration rehearsal. |
| E — Public features | Public DTO, username policy, preview, indexing, revocation. |
| F — Launch | Reconciliation, device QA, recovery/rollback, known-issue list. |
| G — V1 retirement | Successful validation window and disposition of V1-only behavior. |

## First action after approval

Do not begin by writing application code. First resolve the `TBD` product policies, apply feature ratings, and produce a clickable or coded Glance-mode prototype at the narrow reference viewport. That prototype is the quickest way to verify that the new architecture is serving the actual product rather than merely modernizing its appearance.

