# M2 — Domain, Authentication, and Authorization

**Status:** In Progress — M2.1 (Schema and repositories), M2.2 (Policy/service layer), and M2.4 (Contracts and protected-content boundaries) implemented and self-verified, `Ready for PM/QA` at the packet level. M2.3 (OAuth and sessions) is implemented and **Partial**: all logic is built and tested against real Miniflare KV/D1 behind a provider seam, but the live Google round-trip cannot be exercised because M2's own prerequisite is unmet (no Google OAuth client/callback, no staging environment — M2-R4). M2.5 (Adversarial review) not started — explicitly excluded from the 2026-07-25 implementation run by Brian\
**Owner:** Brian  
**Implementation lead:** Claude  
**Primary model:** Claude Opus 5, `xhigh` effort (the milestone index is authoritative; the earlier "Opus 4.8" naming here predates the 2026-07-24 routing update in `docs/milestones/README.md`)\
**Review model:** Separate Claude Opus 5, `xhigh`, fresh context\
**PM/QA:** Codex  
**Estimated focused time:** 5–7 days  
**Production impact:** Isolated staging API only. **Nothing in M2.1 touched any deployed resource** — all migration and repository evidence is from the local Miniflare D1 simulation.

## Outcome

Deliver the stable server-side domain foundation: schema, repositories, services, Google OAuth/session lifecycle, and centrally enforced permissions for users, Lists, memberships, and tasks.

## Prerequisites

- M1 is Accepted.
- M0 role/action/visibility and lifecycle decisions are recorded.
- Isolated staging OAuth callback, D1, and KV resources are available.

## In scope

- Migrations for users, identities, auth/session support, Lists, memberships, tasks, preferences needed by core flows, task/audit events required by approved policy, and schema versioning.
- Explicit constraints, indexes, timestamps, `recycled_at` fields/`recycled` account state, and approved identifiers.
- Repository and domain-service boundaries.
- Google OAuth with high-entropy, expiring, one-time state.
- Opaque server-side sessions, secure cookie policy, sliding/absolute expiry, logout, user/auth-version revocation, and active-user recheck.
- Owner/editor/viewer/admin policies, with administrative authority separated from private task/note/history visibility.
- Runtime schemas, explicit DTOs, origin/CSRF defenses, bounded inputs, parameterized SQL, stable error codes.
- Profile bootstrap fields limited to Google-provided display name/avatar and browser-derived locale/timezone; no V2 profile editor/public username.
- Unit, repository/integration, contract, and authorization-matrix tests.

## Out of scope

- Production OAuth/DNS or live-user onboarding.
- Complete frontend dashboard.
- Management/admin UI.
- Anonymous public routes.
- Invite issuance, redemption, and management (V2.1).
- V1 migration importer.
- Optional search, bulk actions, recurrence, subtasks, tags, or attachments.

## Invariants to prove

- Every sheet has exactly one active owner.
- Owner membership/ownership cannot be removed without an atomic approved transfer.
- A disabled/deleted user cannot use an existing session.
- Role and auth-version changes take effect without waiting for cookie expiry.
- A task always references a valid sheet.
- Moving a task requires the approved rights in source and destination.
- Private tasks/notes obey the approved matrix on reads and writes: List owner may read; Viewer, Editor, and Admin may not. Admin recovery actions operate by opaque identity and do not return protected fields.
- Admin overrides create required audit evidence.
- External DTOs never expose database rows wholesale.

## Work packets

### M2.1 — Schema and repositories — **Implemented 2026-07-24, Ready for PM/QA**

Implement migrations with constraints/indexes and repositories that return domain records/DTO inputs rather than leaking raw rows through routes. Test actual SQL against a migrated database.

Delivered: `migrations/0002_domain_schema.sql` (8 domain tables, CHECK constraints, per-relationship FK delete semantics, 14 indexes, 3 ownership-invariant triggers), `src/shared/domain/` records + enums + bounds, 7 repositories under `src/server/repositories/`, and a new `integration` Vitest project that runs the real migration files against a real D1 database inside workerd (112 tests). See M2-E1 and M2-D2..M2-D5.

### M2.2 — Policy/service layer — **Implemented 2026-07-25, Ready for PM/QA**

Implement centralized policy functions and invariant-preserving services. Route handlers must not duplicate or bypass authorization policy.

Delivered: `src/server/policy/` (6 modules — `actor`, `sheet-access`, `content-visibility`, `admin-policy`, `authorization-error`, `index`) as pure, I/O-free decision functions transcribing Launch Contract §2; `src/server/services/` (6 modules — `sheet-service`, `task-service`, `admin-recovery-service`, `account-service`, `audit`, `service-context`) which load facts, ask policy, then mutate. Content visibility is a separate axis from authority, so `isAdmin` never grants a protected read. See M2-E2 and M2-D7..M2-D10.

### M2.3 — OAuth and sessions — **Implemented 2026-07-25, Partial (M2-R4)**

Implement initiation, state storage/consumption, callback, eligibility, session creation/refresh/revocation, logout, cookie policy, and generic user-facing auth errors. Never log tokens, codes, state, cookies, or provider payloads.

Delivered: `src/server/auth/` (8 modules) — one-time/expiring/server-bound OAuth state and opaque sessions in KV (both stored **hashed**), PKCE S256, 30-day sliding + 90-day absolute expiry, `auth_version` revocation recheck on every request, HttpOnly/SameSite=Lax/env-driven-Secure cookies, and uniform generic auth failures. The Google adapter sits behind an `IdentityProviderClient` seam so the one unverifiable dependency is isolated to a single file. **Not verified:** the live Google round-trip (M2-R4). See M2-E3, M2-D11..M2-D13.

### M2.4 — Contracts and protected-content boundaries — **Implemented 2026-07-25, Ready for PM/QA**

Implement runtime validation and explicit DTO boundaries. Prove that Admin recovery can act on opaque identifiers without returning private task, note, or history-field values.

Delivered: `src/shared/contracts/` (`validation`, `requests`, `dto`) — bounded, closed (unknown-field-rejecting) runtime validation producing one consistent `400 VALIDATION_FAILED` envelope, and allowlist-constructed DTOs; `src/server/middleware/origin.ts` and `authenticate.ts`; `src/server/routes/{auth,sheets,tasks,admin}.ts`. The administrative surface returns only recovery DTOs built from the M2.1 allowlisted projections. See M2-E4 and M2-D14.

### M2.5 — Adversarial review

In a fresh Opus context, review authorization bypasses, confused-deputy paths, ownerless states, IDOR, session fixation/replay, CSRF/origin behavior, enumeration, and sensitive error/log content. Claude implementing the feature may not be the only reviewer.

## Acceptance criteria

Legend: `[x]` = implementation evidence produced by Claude, pending independent Codex verification; `[~]` = partially satisfied by a completed packet, remainder owned by a later packet; `[ ]` = not started.

- [x] Every migration applies to an empty database and the resulting constraints/indexes match the approved model. — M2-E1. `npm run db:migrate:local` applied `0001` + `0002` from a deleted `.wrangler/state` **twice**, plus an idempotent re-apply ("No migrations to apply!") in between; applied objects audited via `wrangler d1 execute` (10 tables, 3 triggers, 14 `idx_*` indexes, `schema_version = 2`) and asserted by exact-list tests in `test/integration/schema.test.ts`.
- [x] Repository integration tests execute the real SQL for create/read/update/recycle/restore/transfer sequences. — M2-E1. 112 tests in the new `integration` Vitest project run inside workerd against a real Miniflare-backed D1 with the actual migration files applied by `applyD1Migrations`, not a mock.
- [x] The complete approved role/action matrix has allow and deny contract tests. — M2-E2. `test/unit/authorization-matrix.test.ts` transcribes Launch Contract §2 as a table and asserts **every** capability against **every** role column (Viewer, Editor, Owner, Admin, stranger, disabled, recycled, disabled-admin, disabled-owner), so a widened permission fails a test naming the role it was widened to. 112 assertions there, plus 49 service-level allow/deny tests against real D1 in `test/integration/authorization-service.test.ts`.
- [x] Viewers receive `403` for every mutation; unauthenticated callers receive the approved `401` behavior. — M2-E2. Seven distinct viewer mutations (task create/update/recycle, List rename/recycle, membership grant, ownership transfer) each asserted `403`, with a positive control proving the viewer can still read. All 21 protected route/method pairs asserted `401` unauthenticated in `test/contract/authenticated-routes.test.ts`, including a regression test that an unresolvable session yields `401` rather than `503` when OAuth is unconfigured.
- [x] Disabled/deleted users and revoked auth versions lose access immediately. — M2-E3. Asserted against real KV/D1 with **no clock advance**: an `auth_version` bump, a `disable`, and a `recycle` each cause the very next `resolveSession` to fail, and the KV record is destroyed rather than merely refused so restoring the state cannot resurrect the session. A deleted user's session is also rejected. Role changes bump `auth_version` in the same service method as the state change.
- [x] Owners cannot orphan a sheet through membership changes, ownership transfer, or user deletion. — M2-E1 (storage) + M2-E2 (service). The M2.1 backstops stand; M2.2 adds explicit service enforcement so the API cannot reach those states: granting the owner a membership is `409`, transferring to a disabled or recycled account is `409`, transferring to the current owner is `409`, and a transfer runs membership removal + owner change in one D1 batch. Tested end to end, including that a denied transfer leaves exactly one owner and no residual membership, and that deleting a List-owning user is still refused.
- [x] Invalid IDs, enums, dates, lengths, unknown sensitive fields, origin, and content types fail consistently. — M2-E4. `src/shared/contracts/validation.ts` produces one `400 VALIDATION_FAILED` envelope with per-field messages for every case; 47 tests in `test/unit/contracts.test.ts` cover shape, enum, UUID, length-boundary (at max and max+1), unknown-field rejection, and content type. Notably `2026-02-30` is rejected here — it passes both the shape regex and the database GLOB, so this layer is the only one that catches it. Origin enforcement is asserted separately in the contract tests.
- [x] OAuth state is one-time, expiring, bound to server-held context, and safe against replay. — M2-E3. Against **real Miniflare KV**: 256-bit state, stored under a SHA-256 hash (asserted absent from every KV key name), consumed exactly once (a replay returns null), expired past its 10-minute TTL, and *spent even when expired* so a late attempt cannot succeed either. The PKCE verifier and post-login redirect live only in the KV record, never the URL. A replayed callback is refused **without any provider call**, asserted via an exchange counter. Redirect paths are sanitised against open redirect (absolute, protocol-relative, backslash, and `javascript:` forms).
- [x] Session cookies meet the approved Secure/HttpOnly/SameSite/Path policy. — M2-E3. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` matching the sliding window, and `Secure` driven by `COOKIE_SECURE` — which yields `Secure` unless explicitly set to `"false"`, so the insecure setting must be chosen deliberately and is never reached by omission (AC-D2's "explicit env-driven Secure"). The clearing cookie repeats every attribute so the browser actually replaces it.
- [x] Private task/note reads and mutations match the M0 matrix, including direct Admin API denial and opaque Admin recovery responses that contain no protected task, note, or history fields. — M2-E4, now complete across all three layers. Policy: a private task is readable and writable only by the List owner; a private note is withheld without hiding the task; Admin is denied both, and `adminMayReadProtectedContent()` returns the literal type `false` so no caller can even type-check a true branch. Denials for private tasks are `404`, never `403`, so the API cannot be used to test whether a private task exists. DTO: `toTaskDto` takes the note decision as an argument and emits `notesRedacted` without the text. Proven by exact-key assertions, `Object.hasOwn` checks, synthetic-marker scans of serialised output, and positive controls confirming the owner still receives the values.
- [x] Profile/bootstrap contracts expose Google display name/avatar and browser locale/timezone without a profile-edit/public-username mutation surface. — M2-E3. `parseProfileBootstrap` accepts **only** `locale` and `timezone`; `displayName`, `avatarUrl`, and `username` are rejected as unknown fields (asserted). Display name and avatar are provider-sourced and refreshed only on sign-in. `toSessionUserDto` omits `authVersion` and email.
- [x] Logs/errors/audit records exclude secrets and unapproved private content. — M2-E2/M2-E3. Audit metadata is typed to primitives only and serialised by one helper, with marker-scan tests proving a List name and a task name/note never reach an audit row. Auth failure reasons go to the server log and never to the response; every user-facing auth failure is identical. The provider adapter never reads or logs a token-endpoint error body (it echoes the authorization code). Repository-wide scan for client secrets, API keys, private keys, and real emails: clean.
- [ ] Fresh Opus adversarial review has no open P0/P1. — M2.5, **not started**: explicitly excluded by Brian from the 2026-07-25 run.

## Required evidence

- Schema diagram and migration/check output.
- Machine-readable or tabular authorization test matrix.
- OAuth/session sequence with test IDs, not secrets.
- Protected-content DTO and opaque-recovery contract results.
- Adversarial review findings and dispositions.
- API error examples with synthetic values.

## QA approach

Codex independently tests horizontal and vertical privilege changes, stale sessions, direct API calls with hidden UI ignored, source/destination task moves, owner transfer failure injection, and private-field access. Tests should prefer generated users/IDs and synthetic content.

The review session uses Opus 4.8 `xhigh`. `max` is allowed only for a specific unresolved invariant/race after the normal review produces conflicting evidence.

## Rollback

Redeploy the prior isolated staging Worker and restore/recreate the staging D1 database. Database rollback must follow the tested restore procedure; Worker rollback alone is insufficient after schema changes.

## Evidence Index

| ID | Acceptance criterion | Evidence | Result | Reviewer |
|---|---|---|---|---|
| M2-E1 | Schema/repository correctness | **M2.1, 2026-07-24.** `migrations/0002_domain_schema.sql` (8 domain tables, per-relationship FK delete semantics, 14 indexes incl. 5 partial, 3 ownership triggers); `EXPECTED_SCHEMA_VERSION` 1→2; `src/shared/domain/{enums,records,limits}.ts`; 7 repositories under `src/server/repositories/`. New `integration` Vitest project (`vitest.workers.config.ts`, `@cloudflare/vitest-pool-workers` 0.18.8) runs the **real migration files** against a **real D1** inside workerd via `applyD1Migrations`. Checks run in-worktree with observed exit results: `format:check` PASS, `lint` PASS, `typecheck` PASS, `test` PASS (135 = 23 node + 112 integration), `db:migrate:local` from deleted `.wrangler/state` PASS ×2 with an idempotent re-apply in between, `build` PASS, `git diff --check` exit 0. Applied-object audit via `wrangler d1 execute --local`: 10 tables / 3 triggers / 14 `idx_*` / `schema_version = 2`. Real `wrangler dev --local` run confirms `GET /api/v1/health` → `200` `{"status":"ok","schemaVersion":2,"expectedSchemaVersion":2}` and the 404 envelope still intact | Produced; Codex verification pending | Codex |
| M2-E2 | Authorization matrix | **M2.2, 2026-07-25.** `src/server/policy/` (6 pure modules) + `src/server/services/` (6 modules). Machine-readable matrix: `test/unit/authorization-matrix.test.ts` asserts every Launch Contract §2 capability against all 9 role/state columns (112 assertions), including a sweep proving ineligible accounts lose *every* capability — which catches a future capability added without an eligibility check. Service-level enforcement against real D1: `test/integration/authorization-service.test.ts` (49 tests) covering viewer-denied mutations, editor recycle-but-not-restore asymmetry, stranger 404-not-403, both-Lists move rule (including that a denied move leaves the task in place), ownership-invariant conflicts, recycle-before-purge, and admin account administration with `auth_version` bumps. Checks run in-worktree: `format:check` PASS, `lint` PASS, `typecheck` PASS, `test` PASS (446), `build` PASS, `git diff --check` exit 0 | Produced; Codex verification pending | Codex |
| M2-E3 | OAuth/session lifecycle | **M2.3, 2026-07-25 — PARTIAL.** `src/server/auth/` (8 modules). `test/integration/auth-lifecycle.test.ts` (41 tests) runs against **real Miniflare KV + real D1**: state entropy/hashing/one-time-consumption/expiry/replay, PKCE, open-redirect sanitisation, session sliding + absolute ceiling, refresh threshold, logout, tampered tokens, and immediate revocation via `auth_version`/`disable`/`recycle` with no clock advance. Cookie policy asserted in `test/contract/authenticated-routes.test.ts`. **NOT RUN — the live Google round-trip**: no OAuth client, redirect URI, or staging environment exists (M2-R4), so `google-provider.ts` is structurally correct but unexercised against the real provider. The seam confines that gap to one file | Partial; live provider exchange unverified | Codex + Brian (M2-R4) |
| M2-E4 | Protected DTO/recovery boundaries | **M2.1 repository half, 2026-07-24.** `test/integration/protected-content.test.ts` (24 tests): the three administrative recovery/metadata reads are built from allowlisted SQL column lists that never select `name`, `notes`, `is_private`, `notes_private`, `status`, `priority`, `due_date`, the List `display_name`, or `changes_json`. Asserted with exact `Object.keys` equality, per-field `Object.hasOwn` checks, and a `JSON.stringify` scan for a synthetic private marker; a positive control confirms the owner history read still returns the full values, so the separation is a real distinction rather than a uniformly broken read. Purging a recycled private task using only its opaque id is exercised end to end **M2.2/M2.4 completion, 2026-07-25.** The policy and DTO halves now exist. `test/integration/admin-recovery-boundary.test.ts` (15 tests) proves the full stack: an Admin restoring or purging a **private** task with private notes receives only `{id, sheetId, recycledAt, createdAt, updatedAt}` — asserted by exact `Object.keys`, per-field `Object.hasOwn`, and `JSON.stringify` marker scans — while positive controls confirm the owner still receives the name, notes, and privacy flag, and the List name. `src/shared/contracts/dto.ts` builds every response from named fields, and the administrative DTOs are structurally distinct types (not a task DTO with fields omitted), so a handler cannot return one where the other is expected. Runtime validation evidence: 47 tests in `test/unit/contracts.test.ts` | Complete across repository, policy, and DTO layers; Codex verification pending | Codex |
| M2-E5 | Adversarial review | Pending — M2.5, to run in a fresh Opus 5 `xhigh` context. M2.2–M2.4 are now complete, so this packet is unblocked and is the milestone's next step. Brian explicitly excluded it from the 2026-07-25 implementation run | Pending | Opus/Codex |

## Decision Log

| ID | Date | Decision | Owner | Rationale/impact |
|---|---|---|---|---|
| M2-D1 | 2026-07-24 | **Closed as already-satisfied, not a live decision.** This row predated M0's acceptance. The permission and lifecycle decisions M2 depends on are recorded: M0-D3 (Viewer/Editor/Owner, new shares default Viewer), M0-D4 + M0-D16 (private tasks/notes exist; Admin cannot read them), M0-D5 + M0-D22 (30-day recycle bin, `recycled_at`, explicit `recycled` account state, `disabled` not overloaded), M0-D6 (owner-only history field values), M0-D12 (canonical `owner_user_id`, UUIDs, SQL repositories, KV sessions), M0-D20 (profile basics). Authoritative matrix: Launch Contract §2; lifecycles: §3 | Brian (recorded in M0) / Claude (identified the row as stale) | Unblocks M2.1–M2.4 without a new decision. No M0 decision was reinterpreted. |
| M2-D2 | 2026-07-24 | **No D1 `sessions` table.** Launch Contract AC-D1 lists "sessions" among the schema items, but M0-D12 and the M0 approved decision record state that "KV is limited to opaque sessions and short-lived authentication/flow state." An explicitly approved architecture decision outranks a word in an acceptance-criterion list, so sessions stay in KV and D1's contribution to immediate revocation is `users.auth_version`. A test asserts no `sessions` table is created | Claude (precedence reading) | Keeps the approved isolation of session storage. **Flagged for Codex:** AC-D1's wording should be corrected so the next reader does not re-open this. |
| M2-D3 | 2026-07-24 | **No `dashboards` / `dashboard_sheets` tables in V2.** At launch there is one dashboard per user and the visible-List selection and ordering are device-local preferences (M0-D9; product plan "Device-local settings (V2) … visible Lists stored locally"). AC-D1 does not list them and M2's in-scope list does not include them. A test asserts they are absent, alongside the V2.1 seams (`invites`, `public_profiles`, `device_profiles`) | Claude (scope reading) | Avoids building an access-control-adjacent table V2 has no use for. If M3 finds it needs server-side dashboard configuration, that is a scope question for Brian, not a silent addition. |
| M2-D4 | 2026-07-24 | **Added four columns the approved architecture's table sketches omit**, each required by approved *behaviour*: `users.auth_version` (M2 in-scope "user/auth-version revocation"; architecture's session section calls for it in prose), `users.locale` (M0-D20 browser-derived locale), `tasks.is_private` (E3.5), `tasks.notes_private` (E5's note: notes are visible to editors/viewers "unless note is marked private", and Launch Contract §2 gives private-note reads to the owner only). Column naming and shape are routine implementation choices | Claude (within authority) | The behaviour was approved; only the storage spelling was open. **Flagged for Codex:** the technical architecture's `users`/`tasks` table sketches are now behind the schema and should be reconciled. |
| M2-D5 | 2026-07-24 | **Integration tests run in workerd against a real D1** via `@cloudflare/vitest-pool-workers` 0.18.8 (peer-compatible with the installed Vitest 4.1.10), added as the packet's only new dependency. Vitest now has two projects: `node` (existing contract tests, behaviour unchanged) and `integration`. Chosen over a `node:sqlite` shim because M2.1's acceptance criterion is explicitly "test actual SQL against a migrated database", and this applies the real migration files rather than a hand-built schema | Claude (within authority) | Makes the FK, CHECK, partial-index, and trigger evidence real. Cost: one devDependency and a workerd binary in CI. |
| M2-D14 | 2026-07-25 | **Origin enforcement is registered on `/api/v1/*`, which changes one M1 behaviour.** An unsafe request to an *unknown* `/api/v1` path now answers `403` (origin) instead of M1's catch-all `404`, because the origin check runs first. Kept deliberately: a route that does not exist must not be a CSRF-exempt hole, and confirming path existence to an unverified cross-origin caller is a small disclosure. Safe methods are unaffected — `GET` on an unknown path still returns the M1 `404` envelope, asserted by a test | Claude (within authority) | Documented in `src/server/index.ts` and pinned by two tests so the change is deliberate rather than incidental. **Flagged for Codex** as the one intentional M1 behaviour change in this packet. |
| M2-D13 | 2026-07-25 | **Session resolution is provider-free.** Validating a session reads KV and D1 only, so it is built without the OAuth provider. Found by a failing test: the first implementation built the full sign-in stack for every authenticated request, which made an environment lacking Google secrets answer `503 AUTH_NOT_CONFIGURED` to an ordinary invalid session — reporting a routine rejection as an outage, and coupling every authenticated request to config it does not need. Logout is provider-free for the same reason: signing out must always work | Claude (within authority) | A regression test asserts `401` for an unresolvable session while the env fixture has no OAuth config, so the coupling cannot silently return. |
| M2-D12 | 2026-07-25 | **Sessions carry a 90-day absolute ceiling alongside the approved 30-day sliding window.** M0 §8 fixes the sliding window; it is silent on an absolute cap. Without one, a session kept warm by use never expires, so a stolen token lives indefinitely. 90 days is three full sliding windows — long enough never to interrupt an ordinary active user, short enough that a forgotten session dies | Claude (within authority) | Adds a bound the approved decision did not address rather than reinterpreting it. **Flagged for Codex:** if Brian wants strictly "30-day sliding, no ceiling", this is the line to change. |
| M2-D11 | 2026-07-25 | **Session tokens and OAuth state are stored hashed (SHA-256) in KV, and the Google ID token is verified via the tokeninfo endpoint rather than local JWKS.** Hashing means a KV dump yields no usable credential. The tokeninfo choice is the weaker of the two verification options and is deliberate: local JWKS verification needs key fetching, caching, rotation, and clock-skew policy, all better built against a real OAuth client than guessed. The audience check against the configured client id is present either way | Claude (within authority) | Recorded as follow-up rather than left implicit: replacing tokeninfo with local JWKS verification is worth doing when M2-R4 is resolved. |
| M2-D10 | 2026-07-25 | **A denial for a private task is `404`, not `403`.** Returning `403` would confirm the task exists, defeating the feature: a caller could enumerate private tasks by status code. The same rule applies to a List the actor cannot reach. `403` is reserved for cases where the actor is permitted to know the object exists but lacks the right | Claude (within authority) | Tested explicitly, including that a genuinely absent object and a hidden one are indistinguishable. |
| M2-D9 | 2026-07-25 | **Task history writes `changes_json = '{}'` for now.** The approved full-fidelity history (actor, time, action, changed fields, complete before/after) is M4's deliverable (AC-M4). Writing a half-specified shape now would either box M4 in or produce records that look complete but are not. The event type, actor, and time — everything the metadata projection exposes — are recorded correctly | Claude (within authority) | **Flagged for Codex/M4:** history *entries* exist and are correctly scoped List-owner-only, but their before/after payload is deliberately empty until M4. |
| M2-D8 | 2026-07-25 | **An admin cannot disable or recycle their own account** (`409 SELF_TARGET_REFUSED`). Not a privacy rule but an availability one: the action is irreversible by the actor, and with a small trusted admin set it can leave the installation with no usable administrator. No approved decision covers this case | Claude (within authority) | Narrow, reversible choice; if Brian wants self-service admin lockout it is a one-line change. |
| M2-D7 | 2026-07-25 | **Administrative authority and content visibility are separate modules, and `adminMayReadProtectedContent()` returns the literal type `false`.** M0-D16 makes "higher role sees more" wrong for V2, so the rule cannot be expressed as a role comparison. The literal return type means a caller cannot even type-check a branch where an admin reads protected content. The administrative recovery service is a *separate class* with no access to a method returning a full `TaskRecord`, so the guarantee is structural rather than disciplinary | Claude (within authority) | Three independent barriers (SQL projection, policy, DTO); any one failing still leaves two. Reversing it is a product decision for Brian, not an implementation change. |
| M2-D6 | 2026-07-24 | **Timestamps in the domain schema are epoch milliseconds**, matching `Date.now()` and the architecture's "epoch milliseconds consistently for instants" API rule. `due_date` stays date-only TEXT `YYYY-MM-DD`. Note the pre-existing `schema_version.applied_at` from M1 uses `unixepoch()` seconds; it is migration bookkeeping, is never exposed, and was left alone rather than rewritten | Claude (within authority) | One convention for all domain instants. The one-row inconsistency is recorded rather than hidden. |

## Risk Log

| ID | Severity | Risk | Mitigation/trigger | Owner | Status |
|---|---|---|---|---|---|
| M2-R1 | P0 | Authorization or private-field exposure | Central policy + exhaustive denial tests | Claude | **Mitigated at the implementation level 2026-07-25, pending independent review.** A central policy layer now exists and every service consults it before mutating; no route makes an authorization decision. 112 matrix assertions + 49 service denial tests + 21 unauthenticated route assertions. **This is not a claim that no bypass exists** — that is precisely what M2.5's adversarial review and Codex QA are for, and neither has run. Treat as "mitigated by construction and by the tests written, independently unverified". |
| M2-R2 | P1 | Administrative DTO exposes protected content | Allowlisted DTOs and direct denial tests | Claude | **Mitigated 2026-07-25, pending independent review.** All three layers are now in place: SQL projections that never select protected columns (M2.1), a policy layer that denies Admin protected reads with a literal-`false` return type, and DTOs built from named allowlists in a structurally distinct type. 15 boundary tests with exact-key assertions, marker scans, and positive controls. Any one layer failing still leaves two. |
| M2-R3 | P1 | Schema change cannot be safely restored | Staging restore rehearsal | Claude | **Open.** `0002` is additive-only (new tables/indexes/triggers; no existing row touched), so a local rollback is `rm -rf .wrangler/state` + re-migrate. **No remote database has been migrated** and no restore rehearsal has been performed — both require Brian's authorization through `production-mutation-gate` and neither was attempted. |
| M2-R4 | P1 | **M2 prerequisite unmet: no isolated OAuth callback and no staging environment exist.** M2's Prerequisites require an "isolated staging OAuth callback, D1, and KV". Only the `dash2-preview` D1/KV exist; `docs/runbooks/environments.md` records staging as not yet created or decided, and no Google OAuth client has been created. M2.3 cannot be implemented or tested end to end without them | Brian creates or authorizes creation of a Google OAuth client and its redirect URI for an isolated Dash2 host, and decides whether M2.3 targets the existing preview environment or a new staging one. Every resource creation goes through `production-mutation-gate`. Does not block M2.1, M2.2, or M2.4 logic/tests | **Brian** | **Open — blocking M2.3 only.** Raised 2026-07-24. |
| M2-R6 | P3 | **Evidence-accuracy defect in the M2.1 handoff, found by Codex's review 2026-07-24 and confirmed.** The handoff reported "21 new / 9 modified" files against an actual diff of 22 new / 11 modified. Two distinct errors: the new count was a hand-count slip against a list that was itself correct and complete, and the modified count was stale — taken from a `git status` snapshot predating the edits to this document and `docs/milestones/README.md`. Same category as M1-R13, lower impact: M1-R13 misstated whether a real deploy had occurred and could have driven a wrong acceptance decision, whereas this misstates a file tally any reviewer confirms in one command, with the correct lists printed alongside it | **Resolved 2026-07-24.** Handoff counts corrected and now derived directly from `git ls-files --others --exclude-standard` and `git diff --name-only`; every other numeric claim in the handoff (test counts 23/112/135, applied objects 10/3/14, migration commands 3+27, lockfile +37 lines / 3 packages, bundle size) was re-checked against observed output and confirmed accurate. The handoff's "0 defects" wording was also narrowed to "0 found by Claude, independently unverified". Process correction: derive file counts as the last step before writing the handoff, after all edits | Claude | Resolved 2026-07-24; pending Codex re-review |
| M2-R7 | P2 | **The Google provider adapter has never contacted Google.** `src/server/auth/google-provider.ts` follows Google's published OpenID Connect contract and its error paths are tested with synthetic responses, but no live exchange has occurred because M2-R4's prerequisite is unmet. Endpoint URLs, parameter names, claim names, and the tokeninfo response shape are therefore *unverified assumptions*. A mistake in any of them would surface only on the first real sign-in | The `IdentityProviderClient` seam confines the risk to one file; everything else in the auth path is tested against real KV/D1 with a fake provider. Resolve by running one real sign-in once Brian provides an OAuth client (M2-R4), then converting the tokeninfo call to local JWKS verification (M2-D11) | Claude (blocked by Brian's M2-R4) | **Open.** Raised 2026-07-25. Cannot be closed by Claude at any effort level. |
| M2-R8 | P3 | **`wrangler dev --local` on this Windows machine crashes workerd when a request body is never read**, which happens on every origin/auth rejection. Manifests as the *next* request failing with "Network connection lost" / HTTP 500 | **Confirmed not a Dash2 defect.** Isolated by `git stash` to pristine M1 (`5a00b54`), where `wrangler dev` crashed with `*** std::terminate() called with no exception` before any M2.2–M2.4 code was present; a bare non-Dash2 Worker with the same request shape survives, so it is specific to this configuration's workerd binary on Windows, not to the rejection logic. All 446 automated tests — which run in workerd via the vitest pool, not the dev server — pass. Impact is on local manual probing only | Claude | **Open — local tooling only.** Raised 2026-07-25. No production impact known; worth re-checking on `ubuntu-latest` CI and after a wrangler upgrade. |
| M2-R5 | P3 | Canonical planning documents are behind the implemented schema: the technical architecture's `users`/`tasks` table sketches omit `auth_version`, `locale`, `is_private`, and `notes_private` (M2-D4), and Launch Contract AC-D1 lists "sessions" as a D1 schema item although sessions are KV-only (M2-D2) | Reconcile both documents during Codex QA rather than leaving a future reader to rediscover the discrepancy. No code change implied | Codex | Open — documentation only, non-blocking |

## PM/QA Sign-off

```text
Claude status: In Progress — M2.1, M2.2, and M2.4 Ready for PM/QA at the packet level; M2.3 Partial.
  Packets M2.2 (policy/services), M2.3 (OAuth/sessions), and M2.4 (contracts/DTOs) implemented and
  self-verified 2026-07-25, on top of M2.1 (2026-07-24). Milestone-level status stays In Progress for two
  reasons: M2.5 (adversarial review) was explicitly excluded from this run by Brian, and M2.3 cannot be
  fully verified until M2-R4 is resolved. Nothing is committed; nothing was deployed; no remote database
  was migrated; no Cloudflare or Google resource was created.
Claude handoff date: 2026-07-25
Codex review: Pending for M2.2/M2.3/M2.4 — no independent review of this packet has occurred. The earlier
  2026-07-24 Codex read covered the M2.1 handoff only, was explicitly not a code review, and its three
  flagged areas remain open claims. Nothing in this packet has been independently verified.
Open P0/P1: 0 defects **found by Claude** during M2.2–M2.4 implementation or self-verification — again a
  statement about what this pass found, not a claim that none exists. One real defect *was* found and fixed
  during the pass, by a test rather than by inspection: session resolution built the full OAuth stack and
  so answered 503 instead of 401 when the provider was unconfigured (M2-D13, regression test added). That
  is the second worked example in this milestone of something self-review missed until something external
  caught it. Open risks: M2-R1 (P0) now mitigated by construction but independently unverified — M2.5 exists
  precisely to test that claim; M2-R2 (P1) mitigated across all three layers, unverified; M2-R3 (P1) open,
  no remote/restore rehearsal; M2-R4 (P1, Brian-owned) still blocks M2.3's live verification; M2-R7 (P2,
  new) the Google adapter has never contacted Google; M2-R8 (P3, new) local wrangler dev instability,
  confirmed pre-existing and not a Dash2 defect.
Brian decision: Pending
Decision date: —
Notes: M2.2 delivered a central policy layer (6 pure modules) and 6 invariant-preserving services; no route
  handler makes an authorization decision. M2.3 delivered the full OAuth/session lifecycle behind an
  identity-provider seam — one-time hashed expiring state, opaque hashed sessions, 30-day sliding plus a
  90-day absolute ceiling (M2-D12, a bound M0 did not address), and immediate revocation via auth_version
  rechecked on every request. M2.4 delivered closed runtime validation and allowlist-constructed DTOs, and
  completed the administrative privacy boundary so an Admin can restore or purge a private task by opaque
  id while receiving no name, note, privacy flag, or history value. Tests went 135 → 446, all PASS, with
  the security-relevant ones running against real Miniflare KV and a real migrated D1 rather than mocks.
  Eight decisions were taken inside Claude's authority (M2-D7..M2-D14); the two most consequential for
  review are M2-D12 (absolute session ceiling) and M2-D14 (origin enforcement changes one M1 catch-all
  response from 404 to 403 on unsafe methods — deliberate, documented, and pinned by tests). Full detail,
  exact commands, and results: `.handoffs/M2-handoff.md`.
```
