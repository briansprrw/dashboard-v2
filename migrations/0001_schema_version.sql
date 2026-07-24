-- M1 foundation: minimal schema-version tracking only.
-- Domain tables (users, sheets, tasks, ...) are out of M1 scope and land in M2+.
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT INTO schema_version (version, applied_at) VALUES (1, unixepoch());
