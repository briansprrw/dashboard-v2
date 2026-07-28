-- M2.1 — Dash2 V2 domain schema.
--
-- Scope note: this migration creates only the tables named by Launch Contract
-- AC-D1 (users, identities, Lists/sheets, memberships, tasks, task_events,
-- preferences, audit). Deliberately NOT created here:
--   * `sessions` — sessions are opaque records in KV, never D1 (M0-D12 and the
--     M0 approved decision record: "KV is limited to opaque sessions and
--     short-lived authentication/flow state"). D1's contribution to immediate
--     revocation is `users.auth_version` below.
--   * `dashboards` / `dashboard_sheets` — at launch, visible Lists and their
--     order are device-local preferences (M0-D9), so no server table is
--     required for V2.
--   * `invites`, `invite_redemptions`, `public_profiles`,
--     `public_profile_sheets`, `device_profiles` — V2.1 seams (M0-D7).
--
-- Conventions used throughout:
--   * Identifiers are application-generated UUID strings (M0-D12). Emails and
--     display names are attributes, never keys.
--   * Instants are INTEGER epoch **milliseconds** (matching `Date.now()` and
--     the architecture's "epoch milliseconds consistently for instants" API
--     rule). Date-only values are TEXT `YYYY-MM-DD`.
--   * Recycle-bin soft deletion uses `recycled_at` plus an explicit state
--     value; `disabled` is never overloaded to mean recycled (M0-D22).
--   * Every foreign key declares an explicit ON DELETE behaviour, chosen
--     per-relationship rather than blanket-cascaded, because purge, ownership
--     transfer, audit, and recovery semantics differ (see each table).

--------------------------------------------------------------------------------
-- users
--------------------------------------------------------------------------------
-- `state` distinguishes all three approved account conditions: `active`,
-- `disabled` (auth blocked, not in the recycle bin), and `recycled` (in the
-- 30-day recovery window). Disabled and recycled users can neither
-- authenticate nor use memberships.
--
-- `auth_version` is the immediate-revocation lever: every authenticated
-- request compares the session's recorded version against this column, so
-- bumping it invalidates every existing session for the user without waiting
-- for cookie expiry.
--
-- Profile basics are limited to what Google supplies (display name, avatar)
-- plus browser-derived locale/timezone (M0-D20). There is deliberately no
-- editable-profile or public-username column in V2.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  avatar_url TEXT CHECK (avatar_url IS NULL OR length(avatar_url) <= 2048),
  global_role TEXT NOT NULL CHECK (global_role IN ('user', 'admin')),
  state TEXT NOT NULL CHECK (state IN ('active', 'disabled', 'recycled')),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version >= 1),
  locale TEXT CHECK (locale IS NULL OR length(locale) <= 35),
  timezone TEXT CHECK (timezone IS NULL OR length(timezone) <= 64),
  recycled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  -- `recycled_at` is set exactly when the account is in the recycle bin, so
  -- the 30-day purge-eligibility window can never be computed from a state
  -- that disagrees with the timestamp.
  CHECK ((state = 'recycled') = (recycled_at IS NOT NULL))
);

CREATE INDEX idx_users_state ON users (state);
CREATE INDEX idx_users_recycled_at ON users (recycled_at) WHERE recycled_at IS NOT NULL;

--------------------------------------------------------------------------------
-- user_identities
--------------------------------------------------------------------------------
-- Identity is separate from `users` so a future provider change never rewrites
-- ownership or task rows. `email_normalized` is globally unique: it is the
-- match key for the migrated-user allowlist, and two accounts must never claim
-- the same mailbox.
--
-- ON DELETE CASCADE: an identity has no meaning without its user, and a
-- permanent account purge must not leave a dangling credential-matching row
-- that could re-attach a future sign-in to a deleted account.
CREATE TABLE user_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 255),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL UNIQUE CHECK (length(email_normalized) BETWEEN 3 AND 320),
  email_display TEXT NOT NULL CHECK (length(email_display) BETWEEN 3 AND 320),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX idx_user_identities_user ON user_identities (user_id);

--------------------------------------------------------------------------------
-- sheets  (user-facing term: "List" — M0-D2)
--------------------------------------------------------------------------------
-- `owner_user_id` is the single canonical owner (M0-D12). Ownership is NOT
-- duplicated as a membership row; see the triggers below.
--
-- ON DELETE RESTRICT on the owner: this is the database-level backstop for
-- "every List has exactly one valid owner". A user row cannot be removed while
-- they still own a List, so an account purge must transfer or purge the owned
-- Lists first — an ownerless List is unrepresentable rather than merely
-- discouraged.
CREATE TABLE sheets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  state TEXT NOT NULL CHECK (state IN ('active', 'recycled')),
  -- Retained only to reconcile a V1 import (M0-D12). Never exposed through an
  -- ordinary or public DTO.
  legacy_source_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  recycled_at INTEGER,
  CHECK ((state = 'recycled') = (recycled_at IS NOT NULL))
);

CREATE INDEX idx_sheets_owner_state ON sheets (owner_user_id, state);
CREATE INDEX idx_sheets_recycled_at ON sheets (recycled_at) WHERE recycled_at IS NOT NULL;

--------------------------------------------------------------------------------
-- sheet_memberships
--------------------------------------------------------------------------------
-- Viewer/editor sharing only. The owner is canonical on `sheets` and must not
-- appear here (a duplicate owner row would make "exactly one owner" a
-- two-table agreement instead of a single fact). New shares default to viewer;
-- that default belongs to the service layer, not a column default, so every
-- write states the role explicitly.
--
-- ON DELETE CASCADE for both keys: a permanently purged List keeps no share
-- rows, and a permanently purged user keeps no viewer/editor grants.
-- `created_by_user_id` is SET NULL so removing the granting admin/owner never
-- removes the grant itself.
CREATE TABLE sheet_memberships (
  sheet_id TEXT NOT NULL REFERENCES sheets (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at INTEGER NOT NULL,
  created_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (sheet_id, user_id)
);

CREATE INDEX idx_sheet_memberships_user ON sheet_memberships (user_id);

-- The three ownership-invariant triggers that belong with this table live in
-- `0003_ownership_triggers.sql`, not here. That split is not stylistic: a
-- trigger body contains its own statement terminators, and Wrangler's remote
-- migration path splits a migration file on those terminators before sending
-- each piece to D1's HTTP API — which cuts a trigger in half and fails with
-- "incomplete input". Applying the triggers from a file of their own, one
-- statement per file, is what makes them deployable to a real database.
-- See `0003` for the full explanation and the invariant they protect.

--------------------------------------------------------------------------------
-- tasks
--------------------------------------------------------------------------------
-- `is_private` (E3.5) and `notes_private` (E5) are separate flags because they
-- protect different things: a private task is invisible to everyone but the
-- List owner, while a task with a private note stays visible with its note
-- withheld. Neither is readable through administrative authority (M0-D16);
-- that separation is enforced by policy and by repository reads that never
-- select the protected columns, not by this table.
--
-- ON DELETE CASCADE from `sheets`: permanently deleting a List purges its
-- contained tasks as one unit (approved List lifecycle). `created_by_user_id`
-- and `updated_by_user_id` are SET NULL so purging a user never destroys tasks
-- that live in someone else's List.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sheets (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (
    status IN ('not_started', 'in_progress', 'pending', 'blocked', 'complete', 'cancelled')
  ),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  -- Optional: undated work is displayed as TBD (B8). Stored canonically as
  -- `YYYY-MM-DD`; the GLOB pattern rejects free-text and alternate formats at
  -- the storage boundary as well as in runtime validation.
  due_date TEXT CHECK (
    due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  notes_private INTEGER NOT NULL DEFAULT 0 CHECK (notes_private IN (0, 1)),
  -- Bounded, validated list serialised by the service layer; never
  -- free-form markup.
  emoji_flags_json TEXT CHECK (emoji_flags_json IS NULL OR length(emoji_flags_json) <= 512),
  sort_key INTEGER NOT NULL,
  created_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER,
  recycled_at INTEGER,
  -- Non-unique on purpose: reconciliation needs to find imported rows, but a
  -- re-run that produces a duplicate should be reported by the migration
  -- reconciliation step rather than aborted mid-load by a storage constraint.
  legacy_source_id TEXT,
  -- `closed_at` is set exactly when the task is in a closed status, so
  -- closed-task retention and "N days since closed" visibility rules can never
  -- read a timestamp that disagrees with the status.
  CHECK ((status IN ('complete', 'cancelled')) = (closed_at IS NOT NULL))
);

-- The dashboard's hot path: active (non-recycled) tasks for a List in launch
-- sort order. Partial so recycled rows never inflate it.
CREATE INDEX idx_tasks_sheet_sort ON tasks (sheet_id, sort_key) WHERE recycled_at IS NULL;
-- Due-band classification and closed-task visibility filters.
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE recycled_at IS NULL;
CREATE INDEX idx_tasks_closed_at ON tasks (closed_at) WHERE recycled_at IS NULL AND closed_at IS NOT NULL;
-- Recycle-bin listing and 30-day purge-eligibility sweeps.
CREATE INDEX idx_tasks_recycled_at ON tasks (recycled_at) WHERE recycled_at IS NOT NULL;
CREATE INDEX idx_tasks_legacy_source ON tasks (legacy_source_id) WHERE legacy_source_id IS NOT NULL;

--------------------------------------------------------------------------------
-- task_events  (task history)
--------------------------------------------------------------------------------
-- `changes_json` holds full before/after values including task names and
-- notes, so it is protected content: only the List owner may read it. Admin
-- authority grants allowlisted administrative metadata only (M0-D16), which is
-- why the repository exposes a metadata read that never selects this column
-- rather than filtering it out after the fact.
--
-- `event_type` intentionally has no CHECK constraint: no approved decision
-- fixes the history vocabulary, and inventing one here would either constrain
-- M4 or require a follow-up migration. The service layer validates it against
-- the documented union in src/shared/domain/enums.ts.
--
-- ON DELETE CASCADE from `tasks`: history is purged with a permanently deleted
-- task and survives recycle/restore (which never deletes the task row).
-- `actor_user_id` is SET NULL so purging a user leaves the history intact.
CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  changes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_task_events_task_created ON task_events (task_id, created_at);

--------------------------------------------------------------------------------
-- user_preferences
--------------------------------------------------------------------------------
-- One bounded, runtime-validated preference document per user. `schema_version`
-- lets an unknown or outdated shape be reported and dropped rather than stored
-- indefinitely. Device-local display choices are NOT stored here (M0-D9).
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  preferences_json TEXT NOT NULL CHECK (length(preferences_json) <= 8192),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  updated_at INTEGER NOT NULL
);

--------------------------------------------------------------------------------
-- audit_events
--------------------------------------------------------------------------------
-- Administrative/security stream, separate from task history: role, ownership,
-- and membership changes, account/List recycle and restore, permanent purge,
-- and administrative overrides. `metadata_json` is allowlisted by the caller
-- and must never contain task names, notes, task-history values, credentials,
-- OAuth material, cookies, or session identifiers.
--
-- `actor_user_id` is SET NULL rather than CASCADE: the audit trail must
-- outlive the actor, including a purge that "may leave an opaque
-- administrative record that a purge occurred". `target_id` is deliberately
-- an unconstrained opaque string — the target may already be purged.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
  target_type TEXT NOT NULL CHECK (length(target_type) BETWEEN 1 AND 32),
  target_id TEXT,
  metadata_json TEXT NOT NULL CHECK (length(metadata_json) <= 4096),
  request_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_events_created_at ON audit_events (created_at);
CREATE INDEX idx_audit_events_target ON audit_events (target_type, target_id);

--------------------------------------------------------------------------------
-- schema version
--------------------------------------------------------------------------------
-- Deliberately NOT recorded here. The domain schema is only complete once the
-- ownership-invariant triggers in `0003_ownership_triggers.sql` exist, so the
-- version bump lives at the end of `0003`. A database that has applied `0002`
-- but not `0003` has tables without their ownership backstop, and must not
-- report itself as ready: /api/v1/health compares the recorded version against
-- EXPECTED_SCHEMA_VERSION and correctly degrades until `0003` lands.
