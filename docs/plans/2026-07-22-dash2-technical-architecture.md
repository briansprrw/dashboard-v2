# Dash2 Technical Architecture

**Target:** `dash2.dnky.us`  
**Status:** Proposed architecture for approval  
**Date:** 2026-07-22  
**Related documents:** [Product plan](./2026-07-22-dash2-product-plan.md) · [Implementation plan](./2026-07-22-dash2-implementation-plan.md)

## Executive decision

Build Dash2 as a separate, strict-TypeScript Cloudflare application with:

- Cloudflare Workers for API execution and static-asset delivery.
- Hono for HTTP routing and middleware.
- D1 for relational application data.
- KV for opaque server-side sessions and short-lived OAuth/invite state.
- A Vite-built React web application using one responsive component model.
- Shared runtime schemas as the client/server contract.
- SQL migrations, explicit repositories, and service-level transactions/invariants.
- Playwright browser projects for narrow desktop, full desktop, phones, tablets, and smart-frame viewports.

Dash2 uses new Cloudflare resources and a new schema. V1 is read only to migration tooling and remains operational until cutover is accepted.

## Why this architecture

The existing platform is appropriate for the product's scale and operational model. The debt comes from ambiguous domain rules, a monolithic UI, and missing validation/invariants rather than an unsuitable hosting platform.

The proposed structure optimizes for:

- A small operational footprint.
- Fast global static delivery and low-latency API access.
- Explicit, testable authorization.
- A responsive dashboard without duplicate desktop/mobile implementations.
- A clean data migration boundary.
- Straightforward maintenance by one primary developer.

## System context

```text
Authenticated browser / display device
                │
                │ HTTPS + secure session cookie
                ▼
       dash2.dnky.us Cloudflare Worker
          ├── static Vite assets
          ├── Hono /api/v1 routes
          ├── security headers
          └── public page routing
                │
       ┌────────┼───────────┐
       ▼        ▼           ▼
      D1       KV       Google OAuth
 application  sessions    identity
    data       + nonce

One-time migration path:
V1 D1 export → validator/transformer → Dash2 D1 → reconciliation report
```

## Architectural boundaries

### Web application

Responsible for:

- Rendering Standard, Glance, and Manage modes.
- Responsive composition and accessibility.
- In-memory server-data cache and refresh behavior.
- Per-device presentation preferences.
- Calling typed API functions.
- Showing authorization and validation errors.

Not responsible for:

- Deciding whether an action is authorized.
- Enforcing task or membership invariants.
- Constructing SQL or knowing storage table shapes.
- Rendering internal database records directly.

### HTTP/API layer

Responsible for:

- Routing.
- Parsing and runtime validation.
- Authentication/session loading.
- Calling an authorization policy and domain service.
- Mapping service results to explicit DTOs.
- Consistent errors, headers, request IDs, and logging.

Not responsible for:

- Embedding SQL.
- Reimplementing domain rules independently per route.
- Returning `SELECT *` records.

### Domain services and policies

Responsible for:

- Task lifecycle and field normalization.
- Sheet lifecycle and ownership transfer.
- Membership authorization.
- Public-dashboard projection.
- Invite reservation/redemption.
- Audit-event creation.
- Coordinating multi-statement writes.

### Repositories

Responsible for:

- Parameterized SQL.
- Mapping database rows to domain records.
- Focused read and write operations.
- Hiding D1-specific access from services.

Repositories do not decide permissions or return HTTP responses.

## Proposed technology choices

| Area | Choice | Rationale |
|---|---|---|
| Language | TypeScript with strict mode | One language across browser, Worker, contracts, migration tooling, and tests. |
| Web UI | React + Vite | Mature component model, accessible ecosystem, and straightforward Cloudflare static build. |
| Styling | Authored CSS with design tokens, CSS Grid/Flexbox, container queries, and small component-scoped files | Keeps density and responsive behavior explicit without adopting a generic component-system aesthetic. |
| Server | Hono on Cloudflare Workers | Matches the working platform and keeps routing small. |
| Validation/contracts | Shared runtime schema library with inferred TypeScript types | Runtime JSON must be validated; TypeScript annotations alone are insufficient. |
| Database | D1/SQLite with hand-reviewed SQL migrations | Relational constraints fit users, ownership, membership, tasks, and public selection. Explicit SQL keeps migration behavior visible. |
| Sessions | Opaque session ID in an HttpOnly cookie; session record in KV | Preserves immediate server-side revocation and avoids browser-held identity claims. |
| Unit/integration tests | Fast TypeScript test runner plus a real local D1-compatible database path where possible | Covers domain rules and actual migration/schema behavior rather than only mocks. |
| Browser tests | Playwright | Same workflow can run across named browser/device/viewport projects. |
| IDs | Application-generated UUIDs | Stable IDs independent of email, names, row order, or migration source. |

Package versions should be pinned by the lockfile when the repository is created. The architecture does not depend on a specific major version beyond supported Cloudflare Workers compatibility.

## Proposed repository structure

```text
dashboard-v2/
  docs/
    product/
    architecture/
    runbooks/
  migrations/
    0001_initial.sql
    0002_*.sql
  scripts/
    migrate-v1/
      extract.ts
      validate.ts
      transform.ts
      load.ts
      reconcile.ts
  src/
    server/
      index.ts
      env.ts
      middleware/
      routes/
        auth.ts
        me.ts
        dashboards.ts
        sheets.ts
        tasks.ts
        memberships.ts
        public.ts
        admin.ts
      policies/
        sheet-policy.ts
        task-policy.ts
        admin-policy.ts
      services/
        auth-service.ts
        task-service.ts
        sheet-service.ts
        sharing-service.ts
        invite-service.ts
        public-dashboard-service.ts
      repositories/
        user-repository.ts
        task-repository.ts
        sheet-repository.ts
        membership-repository.ts
        public-repository.ts
      session/
      errors/
    web/
      app/
      routes/
      components/
        dashboard/
        tasks/
        sheets/
        settings/
        admin/
      hooks/
      state/
      styles/
      accessibility/
    shared/
      contracts/
      domain/
      constants/
  test/
    unit/
    integration/
    contract/
    e2e/
    fixtures/
  public/
    _headers
  package.json
  tsconfig.json
  vite.config.ts
  playwright.config.ts
  wrangler.jsonc
```

This is a modular monolith, not a collection of services. Boundaries exist in code for clarity and testing; deployment remains one web/API application.

## Data model

### Design rules

1. Emails, sheet names, and public usernames are attributes, never primary keys.
2. Internal IDs are never used as public-dashboard identifiers.
3. Every task belongs to exactly one sheet.
4. Every sheet has exactly one valid owner.
5. Owner authority is canonical on the sheet record; viewer/editor sharing is represented separately.
6. Soft deletion/archive is preferred for user-created content.
7. Public inclusion is separate from authenticated access.
8. Dates and enums are stored canonically and validated before persistence.
9. Database constraints backstop service rules where D1/SQLite can express them safely.
10. Audit history is append-only from normal application routes.

### Core tables

#### `users`

```text
id TEXT PRIMARY KEY
display_name TEXT NOT NULL
avatar_url TEXT
global_role TEXT NOT NULL CHECK ('user', 'admin')
state TEXT NOT NULL CHECK ('active', 'disabled')
timezone TEXT
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL
last_seen_at INTEGER
```

#### `user_identities`

```text
provider TEXT NOT NULL
provider_subject TEXT NOT NULL
user_id TEXT NOT NULL REFERENCES users(id)
email_normalized TEXT NOT NULL UNIQUE
email_display TEXT NOT NULL
PRIMARY KEY (provider, provider_subject)
```

Identity is separate so a future provider change does not rewrite ownership or task records.

#### `sheets`

```text
id TEXT PRIMARY KEY
owner_user_id TEXT NOT NULL REFERENCES users(id)
display_name TEXT NOT NULL
state TEXT NOT NULL CHECK ('active', 'archived')
legacy_source_id TEXT UNIQUE
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL
archived_at INTEGER
```

`owner_user_id` is the single canonical owner. In the domain/API, the owner appears as an owner membership. Storage does not duplicate owner state in two tables.

#### `sheet_memberships`

```text
sheet_id TEXT NOT NULL REFERENCES sheets(id)
user_id TEXT NOT NULL REFERENCES users(id)
role TEXT NOT NULL CHECK ('viewer', 'editor')
created_at INTEGER NOT NULL
created_by_user_id TEXT REFERENCES users(id)
PRIMARY KEY (sheet_id, user_id)
```

The owner does not need a duplicate membership row. Ownership transfer updates the sheet and resolves any conflicting membership in one service operation.

#### `tasks`

```text
id TEXT PRIMARY KEY
sheet_id TEXT NOT NULL REFERENCES sheets(id)
name TEXT NOT NULL
status TEXT NOT NULL
priority TEXT NOT NULL
due_date TEXT
notes TEXT
emoji_flags_json TEXT
sort_key INTEGER NOT NULL
created_by_user_id TEXT REFERENCES users(id)
updated_by_user_id TEXT REFERENCES users(id)
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL
closed_at INTEGER
archived_at INTEGER
legacy_source_id TEXT
```

Rules:

- `due_date` is `YYYY-MM-DD` or null.
- Status and priority use fixed approved enums.
- `closed_at` changes only on an open-to-closed or closed-to-open transition.
- `archived_at` removes the task from active reads without destroying it.
- Notes have an explicit maximum length.
- Flags are validated as a bounded list before JSON serialization.
- `sort_key` supports stable ordering. If manual reorder is deferred, new tasks can use a monotonic spacing strategy and deterministic tie-breaker.

#### `task_events`

```text
id TEXT PRIMARY KEY
task_id TEXT NOT NULL REFERENCES tasks(id)
actor_user_id TEXT REFERENCES users(id)
event_type TEXT NOT NULL
changes_json TEXT NOT NULL
created_at INTEGER NOT NULL
```

Only approved task history is stored; sensitive values are not copied into general application logs.

#### `dashboards`

```text
id TEXT PRIMARY KEY
owner_user_id TEXT NOT NULL REFERENCES users(id)
name TEXT NOT NULL
is_default INTEGER NOT NULL CHECK (0, 1)
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL
```

#### `dashboard_sheets`

```text
dashboard_id TEXT NOT NULL REFERENCES dashboards(id)
sheet_id TEXT NOT NULL REFERENCES sheets(id)
position INTEGER NOT NULL
is_collapsed_default INTEGER NOT NULL CHECK (0, 1)
PRIMARY KEY (dashboard_id, sheet_id)
```

If multiple dashboards are deferred, each user still receives one default dashboard. This prevents the visible-sheet/order model from being entangled with access control.

#### `user_preferences`

```text
user_id TEXT PRIMARY KEY REFERENCES users(id)
preferences_json TEXT NOT NULL
schema_version INTEGER NOT NULL
updated_at INTEGER NOT NULL
```

Only a bounded, runtime-validated preference schema is accepted. Unknown legacy settings are reported and dropped rather than stored indefinitely.

#### `device_profiles`

For normal browsers, a random device-profile ID and non-sensitive display choices may live in local storage. If synchronization or smart-frame management is approved, persist server-side profiles:

```text
id TEXT PRIMARY KEY
user_id TEXT NOT NULL REFERENCES users(id)
name TEXT
mode TEXT NOT NULL
settings_json TEXT NOT NULL
last_used_at INTEGER
revoked_at INTEGER
```

Task contents are not persisted in local storage by default. During a refresh failure, the current page retains its in-memory data and marks it stale.

#### `invites` and `invite_redemptions`

Invites store a hashed or sufficiently random code/token, capacity, expiration, state, and creator. Redemption is a recorded invariant rather than a counter updated after provisioning. The service must claim capacity successfully before creating a new account and must recover or finalize the claim atomically.

#### `public_profiles`

```text
user_id TEXT PRIMARY KEY REFERENCES users(id)
username_normalized TEXT NOT NULL UNIQUE
username_display TEXT NOT NULL
enabled INTEGER NOT NULL CHECK (0, 1)
allow_indexing INTEGER NOT NULL CHECK (0, 1)
theme_json TEXT NOT NULL
updated_at INTEGER NOT NULL
```

#### `public_profile_sheets`

```text
user_id TEXT NOT NULL REFERENCES public_profiles(user_id)
sheet_id TEXT NOT NULL REFERENCES sheets(id)
position INTEGER NOT NULL
PRIMARY KEY (user_id, sheet_id)
```

Only owned sheets may be published initially. A service verifies ownership on every configuration change and every public projection.

#### `audit_events`

```text
id TEXT PRIMARY KEY
actor_user_id TEXT REFERENCES users(id)
action TEXT NOT NULL
target_type TEXT NOT NULL
target_id TEXT
metadata_json TEXT NOT NULL
request_id TEXT
created_at INTEGER NOT NULL
```

Audit metadata is allowlisted and must not contain session IDs, OAuth tokens, full task notes, or other secrets.

## Authorization model

Authorization is expressed through named policy functions, not repeated SQL snippets.

```text
canReadSheet(actor, sheet)
canCreateTask(actor, sheet)
canEditTask(actor, task, sheet)
canArchiveTask(actor, task, sheet)
canPermanentlyDeleteTask(actor, task, sheet)
canMoveTask(actor, sourceSheet, targetSheet)
canManageMembers(actor, sheet)
canTransferOwnership(actor, sheet)
canConfigurePublicProfile(actor, profile)
canAdministerUsers(actor)
```

Each mutating service:

1. Loads the actor and required resources.
2. Calls the appropriate policy.
3. Validates the requested state transition.
4. Performs the write.
5. Records an audit/task event when required.
6. Returns a domain result, not a database row.

The browser may hide unavailable controls for usability, but server policy remains authoritative.

## API design

### Conventions

- Base path: `/api/v1`.
- JSON request and response bodies.
- Explicit DTOs; never return `SELECT *`.
- ISO `YYYY-MM-DD` for date-only values and ISO timestamps or epoch milliseconds consistently for instants.
- Pagination on potentially growing history/admin collections.
- A stable error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Task name is required",
    "fields": { "name": "Required" },
    "requestId": "..."
  }
}
```

- Unknown JSON fields rejected on sensitive writes.
- Bounded request body, string lengths, collection sizes, and numeric ranges.
- Mutation responses return the updated resource DTO where it prevents an immediate refetch.
- Optimistic concurrency is proposed through `updatedAt` or an entity version on edits likely to conflict.

### Proposed endpoints

```text
GET    /api/v1/me
GET    /api/v1/bootstrap

GET    /api/v1/dashboards
POST   /api/v1/dashboards
PATCH  /api/v1/dashboards/:dashboardId
PUT    /api/v1/dashboards/:dashboardId/sheets

GET    /api/v1/sheets
POST   /api/v1/sheets
PATCH  /api/v1/sheets/:sheetId
POST   /api/v1/sheets/:sheetId/archive
POST   /api/v1/sheets/:sheetId/restore
GET    /api/v1/sheets/:sheetId/members
PUT    /api/v1/sheets/:sheetId/members/:userId
DELETE /api/v1/sheets/:sheetId/members/:userId
POST   /api/v1/sheets/:sheetId/transfer

GET    /api/v1/tasks?dashboardId=...&includeClosed=...
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:taskId
POST   /api/v1/tasks/:taskId/move
POST   /api/v1/tasks/:taskId/archive
POST   /api/v1/tasks/:taskId/restore
DELETE /api/v1/tasks/:taskId
GET    /api/v1/tasks/:taskId/events

GET    /api/v1/preferences
PUT    /api/v1/preferences

GET    /api/v1/public-profile
PUT    /api/v1/public-profile
GET    /api/v1/public-profile/preview
GET    /api/v1/public/:username

GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/:userId
GET    /api/v1/admin/audit-events
GET    /api/v1/admin/invites
POST   /api/v1/admin/invites
POST   /api/v1/admin/invites/:inviteId/cancel
```

`/api/v1/bootstrap` may return the signed-in user, default dashboard configuration, accessible sheet summaries, effective preferences, and a server timestamp in one read. Task data may be included if measurement shows it improves initial rendering without creating an oversized response.

### Public DTO

Public output is constructed from an allowlist:

```text
PublicDashboard
  username
  displayName
  theme
  updatedAt
  sheets[]
    displayName
    tasks[]
      name
      status
      priority
      dueDate
      hasNotes?  (proposed false/omitted; notes remain private)
      flags?     (only if explicitly approved for public use)
```

Public output must not include:

- User email or provider identity.
- Internal user, sheet, task, membership, or audit IDs.
- Legacy sheet slugs.
- Task notes.
- Created-by/updated-by identities.
- Internal timestamps or archive state.
- Sharing or access-control metadata.

## Session and authentication architecture

### Google OAuth flow

1. Browser requests `/auth/google`.
2. Worker creates a high-entropy, expiring, one-time state record in KV.
3. Any invite context is stored in the state record rather than trusted from the callback URL.
4. Google returns an authorization code and state.
5. Worker atomically consumes the state before token exchange completion can create a session.
6. Worker verifies the identity and active Dash2 user/invite eligibility.
7. Worker creates an opaque session record in KV.
8. Browser receives only a secure HttpOnly session cookie.

### Cookie policy

- `Secure` by default.
- `HttpOnly`.
- `SameSite=Lax` unless an approved integration requires otherwise.
- `Path=/` and no broad parent-domain cookie.
- Production and local insecurity controlled by an explicit environment value, not inferred from redirect configuration.
- Consider a `__Host-` cookie name when final hostname/callback behavior is verified.

### Session record

```text
session ID → user ID, created time, last refresh time, absolute expiry,
             authentication version, optional device-profile ID
```

Every authenticated request rechecks active user state and global role from D1. A user-level authentication version allows immediate bulk revocation. Sliding expiration is bounded by an absolute maximum if approved.

### CSRF and request-origin defenses

- OAuth state for authorization redirects.
- SameSite cookie baseline.
- Validate `Origin` on authenticated mutations.
- No mutating GET endpoints.
- Require JSON content type on JSON mutations.
- Public endpoints remain read-only.

## Frontend architecture

### One responsive application

Dash2 will not detect “mobile” and load a separate behavior path. Components and actions are shared. CSS media/container queries alter composition, density, and placement.

```text
App shell
  ├── Dashboard route
  │     ├── Display header (date/time/status/menu)
  │     ├── Dashboard layout
  │     │     └── Sheet section[]
  │     │           └── Task row[]
  │     └── Task editor (dialog or bottom sheet by layout)
  ├── Sheets/share route or panel
  ├── Preferences route or panel
  ├── Admin route
  └── Public dashboard route
```

The task editor can be a centered dialog at wide sizes and a bottom/full-height sheet at narrow sizes while using the same form component and save action.

### State ownership

| State | Owner |
|---|---|
| Authenticated user and server capabilities | Bootstrap/server-data cache |
| Tasks, sheets, memberships | Server-data cache; server remains authoritative |
| Current route/panel/task | Router/component state |
| Draft task form | Form component |
| Glance/standard mode and scale | Per-device profile/local storage |
| Dashboard sheet order/visibility | Server dashboard configuration |
| Section collapsed state | Per-device profile/local storage initially |
| User settings | Validated server preference record |
| Stale/offline status | Refresh controller |

Avoid a single global store containing every UI concern. Shared task mutations live in one action layer so keyboard, touch, desktop, and Glance surfaces cannot drift.

### Refresh behavior

- Fetch immediately after authentication/bootstrap.
- Use one in-flight refresh at a time with cancellation.
- Pause or reduce polling when the page is hidden, except for approved smart-frame behavior.
- Use conditional responses/version tokens if measurement justifies them.
- Retain current in-memory tasks when refresh fails.
- Show last successful refresh and a subtle stale indicator.
- Back off repeated failures and recover automatically.
- Do not store private task content in local storage by default.

### Glance-mode CSS model

Use design tokens rather than scattered per-element values:

```text
--dashboard-gutter
--section-gap
--task-row-height
--task-row-gap
--task-font-size
--status-column-width
--due-column-width
--priority-column-width
--display-scale
--color-overdue / today / soon / future / complete / unscheduled
```

The task row is a CSS grid with protected icon/date columns and one flexible, truncating task-name column. The page uses container queries so the dashboard responds to its actual allocated width, including a narrow desktop panel, rather than assuming device type from user agent.

### Accessibility

- Semantic section headings and lists.
- Visible focus indication in every mode.
- Dialog/bottom-sheet focus trapping and restoration.
- Keyboard equivalents for core task actions.
- Minimum touch targets in interactive modes; passive rows may remain visually dense while exposing a larger invisible/adjacent hit target.
- Status/due meaning available as text/accessible names, not color alone.
- Reduced-motion behavior for urgent flashing and transitions.
- Zoom and large-text testing without losing action access.

## Security architecture

### Response headers

Static assets and API responses receive appropriate policies through Cloudflare static `_headers` and Worker middleware:

- Content Security Policy without unsafe inline script/event-handler dependencies.
- Strict-Transport-Security after domain behavior is verified.
- `X-Content-Type-Options: nosniff`.
- Frame denial or a narrowly defined `frame-ancestors` policy.
- Referrer policy.
- Permissions policy.
- `Cache-Control: no-store` for authenticated/private API responses.
- Deliberate bounded caching for public DTO responses.

### Input/output safety

- Runtime schema validation at every route boundary.
- DOM text rendering through framework escaping; no untrusted HTML rendering.
- Validated enum-based theme tokens or strict color parsing.
- Parameterized SQL exclusively.
- Bounded names, notes, flags, request bodies, and collection operations.
- Generic external errors and structured redacted internal logs.

### Rate and abuse controls

- Rate-limit OAuth initiation, invite verification, and public username probes.
- Do not reveal whether a private email is allowlisted through anonymous error detail.
- Normalize public usernames before uniqueness checks.
- Reserve application routes and abuse-prone names.
- Apply stricter cache/rate policy to anonymous public responses than to static assets.

## Performance budgets

These are engineering targets to validate under production-shaped data, not service-level guarantees.

| Area | Target |
|---|---|
| Initial application asset payload | Keep the initial compressed JavaScript/CSS intentionally small; set a measured CI budget after the first prototype. |
| Dashboard first useful render | Under 1.5 seconds on a normal broadband desktop after authentication, with a visible shell immediately. |
| Warm task refresh | Typically under 500 ms end-to-end for expected data volume. |
| Task mutation feedback | Immediate pending state; confirmed or clearly failed within the API response window. |
| Animation | Avoid layout-heavy animation; target smooth interaction on lower-powered smart frames. |
| Dashboard response size | Return only selected dashboard tasks/fields; warn or paginate when approved limits are exceeded. |

Measure before adding client complexity. The likely bottleneck is DOM/layout volume on display devices rather than D1 capacity at the current scale.

## Database access and concurrency

- Use explicit indexes for membership lookups, active tasks by sheet, due/closed filters, dashboard ordering, public username, and audit time.
- Combine invariant-dependent statements in D1-supported transactional/batch operations.
- Avoid the V1 pattern of reading `MAX(row_index)` and then writing an adjacent value without a defined concurrency strategy.
- If manual order launches, allocate spaced sort keys and rebalance under a controlled sheet operation; use deterministic ID/time tie-breakers.
- Use optimistic concurrency on task edits if testing shows meaningful multi-user collisions.
- Never blanket-apply cascades without reviewing archive, ownership transfer, audit, and recovery semantics.

## Migration architecture

### Isolation

- Migration code has read credentials/access to V1 and write access to the selected Dash2 target.
- Application runtime code has no V1 binding.
- The production migration is run as an explicit operator action, not on Worker startup.
- Source exports and transformed files are treated as sensitive temporary artifacts and excluded from source control.

### Pipeline

```text
Extract
  └── V1 rows + source metadata
        ↓
Validate
  └── known shape, normalization, orphan/duplicate report
        ↓
Transform
  └── deterministic IDs and V1→V2 mappings
        ↓
Load
  └── ordered insertion into an empty/migration-batch target
        ↓
Reconcile
  └── counts, invariants, exceptions, sampled hashes/content checks
```

### Data preservation choices

- Keep a `legacy_source_id` where it materially helps reconciliation; never expose it through normal/public DTOs.
- Preserve valid creation/update/closed timestamps.
- Normalize status and priority case.
- Preserve task names, notes, due dates, flags, and ordering when valid.
- Quarantine invalid rows rather than silently inventing owners or dates.
- Import only approved settings, with type conversion and a dropped-setting report.
- Generate new application IDs independently of legacy email-derived slugs.

### Cutover consistency

The recommended approach is a short V1 write freeze and one final repeatable import. Dual writes and change-data capture would introduce more risk than they remove for this application's size. If a near-zero-freeze requirement appears, revisit this decision before migration code is finalized.

## Testing architecture

### Unit tests

- Date/status/priority normalization.
- Task closed/open transitions.
- Public username normalization and reserved names.
- Preference validation.
- Authorization policy functions.
- Public DTO serialization.

### Repository/integration tests

- Apply every migration to an empty database.
- Apply schema against representative imported data.
- Verify constraints and indexes.
- Exercise actual repository SQL.
- Verify archive/restore and ownership transfer sequences.
- Verify invite capacity under competing requests as closely as the local D1 environment permits.

### Contract/API tests

- Authentication and session revocation.
- Validation error shapes.
- Full role/action authorization matrix.
- Public field exclusion.
- Destructive-action and recovery behavior.
- Request-origin and security headers.

### Browser tests

Use shared workflow specifications across named projects:

- Narrow Chromium desktop column.
- Full 1920×1080 Chromium/Edge.
- Phone-sized Chromium and WebKit.
- iPad-sized portrait and landscape.
- Smart-frame viewports with touch/no-hover variants.
- Firefox smoke project.

Core browser flows:

- Logged-out/login/error states.
- View/refresh/stale dashboard.
- Create/edit/quick-complete/move/archive/restore task.
- Enter/exit/restore Glance mode.
- Viewer/editor/owner control visibility plus server enforcement.
- Sheet sharing and ownership transfer.
- Public preview versus anonymous output.
- Admin user/invite recovery workflows.

### Visual regression tests

Capture stable screenshots for:

- Reference narrow desktop layout.
- Empty, typical, dense, and long-text datasets.
- Each due-state color and status/priority combination.
- Glance and Standard modes.
- Mobile task editor and tablet management surfaces.
- Reduced-motion/high-zoom states where screenshot comparison is useful.

Visual snapshots support review; they do not replace semantic and functional assertions.

## Environments and deployment

| Environment | Host/data | Purpose |
|---|---|---|
| Local | Local Worker/D1/KV simulation | Development, migration fixture, fast tests. |
| Preview | Ephemeral Worker deployment and isolated/synthetic data | Branch/PR review. |
| Staging | Stable Dash2 hostname with isolated D1/KV | OAuth, device testing, migration rehearsal, user acceptance. |
| Production | `dash2.dnky.us`, dedicated D1/KV | Approved live application. |

### Deployment rules

- Build artifacts are generated; source TypeScript/JS is not edited in `dist`.
- API routes run through the Worker; cacheable static assets are served by Cloudflare's asset layer.
- Database migrations are a separate, explicit deployment step.
- Worker versions do not substitute for D1 recovery because code/static deployment rollback does not roll back database state.
- Production deployment records the application version and expected schema version.
- Application startup/health rejects or reports an incompatible schema version rather than operating unpredictably.

## Observability and operations

### Structured events

- Request ID, route template, status, duration, deployment version, and coarse error code.
- Authentication success/failure category without OAuth tokens or sensitive provider payloads.
- D1/KV operation category and failure, without SQL-bound private values.
- Migration batch ID and reconciliation summary.
- Public-profile enable/disable and administrative changes through the audit log.

### Operational checks

- Health/version endpoint with no sensitive binding details.
- Alert or review path for elevated 5xx, authentication failures, D1 errors, and migration mismatch.
- Runbooks for session invalidation, public-route shutdown, user disablement, D1 recovery, failed migration, and Worker rollback.
- Periodic invariant query for ownerless sheets, missing references, invalid roles/enums, and public configuration referencing archived content.

## Data privacy

- Collect only the Google identity fields needed for account matching and display.
- Treat task names and notes as private application content.
- Do not place private API responses in shared caches.
- Do not persist task content in browser local storage by default.
- Redact task content, invite tokens, OAuth data, cookies, and session IDs from logs.
- Public data is produced through a dedicated projection, never by filtering a private DTO after serialization.
- Define an eventual user-data export/deletion policy before broader external adoption.

## Architectural decisions to approve

| Decision | Proposal | Approval |
|---|---|---|
| Repository | New `dashboard-v2` repository; V1 remains frozen in its current repository. | TBD |
| Frontend | React + Vite with authored CSS and no generic visual component system. | TBD |
| Backend | Hono modular monolith on one Cloudflare Worker. | TBD |
| Storage | New Dash2 D1 database; KV for sessions/short-lived state only. | TBD |
| API | Versioned `/api/v1`, runtime schemas, explicit DTOs. | TBD |
| Ownership storage | Canonical `sheets.owner_user_id`; viewer/editor rows in memberships. | TBD |
| Identifiers | New UUIDs; legacy identifiers retained only for migration reconciliation. | TBD |
| Deletion | Soft-delete/archive normal content; bounded permanent purge workflow. | TBD |
| Device preferences | Local non-sensitive display profile initially; server-backed profiles only if approved. | TBD |
| Private browser cache | In-memory only for launch; retain visible data through refresh errors but not page reload. | TBD |
| Migration | Repeatable transform into new DB plus short final V1 write freeze. | TBD |
| Multi-service architecture | Reject; use one modular deployable application. | TBD |
| ORM | Do not require one initially; use reviewed SQL repositories and migrations. | TBD |

## Deferred architecture decisions

Do not select infrastructure for these until the product feature is approved:

- Durable Objects/WebSockets for real-time updates.
- Queues/Cron for reminders or recurring tasks.
- R2 for attachments.
- Service workers and persistent offline data.
- Full-text search service beyond D1-supported needs.
- Multiple identity providers.
- Cross-account or organization tenancy.
- Native apps.

## Reference documentation

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Workers SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Wrangler commands, export, and Time Travel](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Playwright test projects and device coverage](https://playwright.dev/docs/test-projects)

