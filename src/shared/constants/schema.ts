// Must match the highest applied migration under /migrations. M1 ships only
// the schema-version tracking table itself (migrations/0001_schema_version.sql).
export const EXPECTED_SCHEMA_VERSION = 1;
