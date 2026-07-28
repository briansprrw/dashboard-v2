-- M2.1 — Ownership-invariant triggers, split out of 0002.
--
-- WHY THESE ARE IN A FILE OF THEIR OWN
--
-- A trigger body contains its own statement terminators:
--
--     CREATE TRIGGER ... BEGIN SELECT RAISE(ABORT, '...'); END;
--                                                       ^        ^
--
-- Wrangler's *remote* migration path splits a migration file on those
-- terminators and posts each fragment to D1's HTTP API separately, which cuts a
-- trigger in half and fails the whole migration with
-- `incomplete input: SQLITE_ERROR [code: 7500]`.
--
-- This was not caught by the local tooling: `wrangler d1 migrations apply
-- --local` and the workerd/Miniflare test harness both execute the file through
-- a path that handles trigger bodies correctly, so 0002 applied cleanly to an
-- empty local database twice and to every integration-test database, and still
-- failed on first contact with the real preview database (2026-07-25).
--
-- Keeping the triggers in their own migration keeps each file's statements
-- individually well-formed, which is what the remote path requires. A single
-- trigger sent as one whole statement applies remotely without complaint —
-- verified directly against the preview database before this split was made.
--
-- If a future migration adds a trigger, put it in its own file for the same
-- reason. Do not merge triggers back into a multi-statement migration.
--
--------------------------------------------------------------------------------
-- The invariant
--------------------------------------------------------------------------------
-- Every List has exactly one owner, and that owner is canonical on
-- `sheets.owner_user_id` (M0-D12) — never represented as a membership row.
-- These triggers are the storage-layer backstop for that rule. They are not the
-- only enforcement: the service layer refuses the same operations with explicit
-- 409 responses, and `sheets.owner_user_id` is ON DELETE RESTRICT so a user who
-- still owns a List cannot be deleted. The triggers exist so that a bug in a
-- future service, a manual query, or an import cannot produce a state the
-- application considers impossible.

-- Insert side: the owner of a List can never also hold a viewer/editor row.
CREATE TRIGGER sheet_memberships_reject_owner_insert
BEFORE INSERT ON sheet_memberships
WHEN EXISTS (
  SELECT 1 FROM sheets WHERE sheets.id = NEW.sheet_id AND sheets.owner_user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'sheet owner cannot hold a membership row');
END;

-- Update side (e.g. re-pointing an existing share at the owner's user id).
CREATE TRIGGER sheet_memberships_reject_owner_update
BEFORE UPDATE ON sheet_memberships
WHEN EXISTS (
  SELECT 1 FROM sheets WHERE sheets.id = NEW.sheet_id AND sheets.owner_user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'sheet owner cannot hold a membership row');
END;

-- Ownership-transfer side: transferring a List to a user who currently holds a
-- viewer/editor row must resolve that row in the same operation. The service's
-- transfer runs (delete membership, update owner) as one batch and succeeds;
-- transferring without resolving the membership aborts here.
CREATE TRIGGER sheets_reject_transfer_to_member
BEFORE UPDATE OF owner_user_id ON sheets
WHEN EXISTS (
  SELECT 1 FROM sheet_memberships
  WHERE sheet_memberships.sheet_id = NEW.id AND sheet_memberships.user_id = NEW.owner_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'new owner must not hold a membership row on this sheet');
END;

--------------------------------------------------------------------------------
-- schema version
--------------------------------------------------------------------------------
-- Recorded here rather than at the end of 0002: the domain schema is only
-- complete once these triggers exist. Must stay in step with
-- EXPECTED_SCHEMA_VERSION in src/shared/constants/schema.ts, which
-- /api/v1/health compares against.
INSERT INTO schema_version (version, applied_at) VALUES (2, unixepoch());
