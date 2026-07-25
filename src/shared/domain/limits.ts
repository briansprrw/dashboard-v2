// Bounded-input limits, declared once so the storage CHECK constraints in
// migrations/0002_domain_schema.sql, the runtime request schemas (M2.4), and the
// tests that probe the boundaries cannot drift apart.
//
// Every value here is a *character* length, matching SQLite's `length()` on
// TEXT. Changing one of these requires a matching migration: the constraint is
// in the database, not only in application code.
export const LIMITS = {
  displayName: { min: 1, max: 200 },
  avatarUrl: { min: 1, max: 2048 },
  locale: { min: 1, max: 35 },
  timezone: { min: 1, max: 64 },
  email: { min: 3, max: 320 },
  providerSubject: { min: 1, max: 255 },
  sheetName: { min: 1, max: 200 },
  taskName: { min: 1, max: 500 },
  taskNotes: { min: 0, max: 4000 },
  emojiFlagsJson: { min: 0, max: 512 },
  preferencesJson: { min: 0, max: 8192 },
  auditAction: { min: 1, max: 64 },
  auditTargetType: { min: 1, max: 32 },
  auditMetadataJson: { min: 0, max: 4096 },
  taskEventType: { min: 1, max: 64 },
} as const;

/** Recycle-bin recovery window before content becomes purge-eligible (M0-D5). */
export const RECYCLE_RETENTION_DAYS = 30;
