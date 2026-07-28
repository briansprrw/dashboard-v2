// Must match the highest applied migration under /migrations.
//   1 — schema-version tracking table only (0001_schema_version.sql, M1)
//   2 — V2 domain schema: users, identities, sheets, memberships, tasks,
//       task_events, preferences, audit (0002_domain_schema.sql, M2.1)
//   3 — user_identities.subject_pending, the permanent-identity-binding flag
//       (0004_identity_subject_pending.sql, M2 correction M2-FQA-RR-01)
export const EXPECTED_SCHEMA_VERSION = 3;
