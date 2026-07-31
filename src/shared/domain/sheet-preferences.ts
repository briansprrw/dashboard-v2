// The one server-backed, cross-device preference V2 launches with: a user's
// own sheet order and which of their accessible Lists they have hidden from
// the dashboard (M4.3, M4-D3). Deliberately narrow and distinct from the
// device-local display preferences in `src/web/state/preferences-schema.ts`
// (mode, zoom, theme, due bands, collapsed-section state, etc.), which stay
// local per M0 §7/M0-D9 — this is the one exception M4's own in-scope line
// names ("User-specific sheet order/visibility"), not a general synced-
// profile system (that remains V2.1, M0 §7/§11).
//
// Stored as the `preferences_json` document in `user_preferences`
// (`PreferencesRepository`, M2.1) rather than a new table: the column already
// exists as a bounded, versioned, runtime-validated document built for
// exactly this shape of data.

import { LIMITS } from './limits';

export const SHEET_PREFERENCES_SCHEMA_VERSION = 1;

/**
 * Per-field id-count cap (M4-QA-05). Chosen so that a *maximal* document —
 * both fields at this count, every id a full 36-character UUID — still fits
 * `LIMITS.preferencesJson.max` (8,192 bytes) after JSON serialization:
 * `100` ids/field × 2 fields × ~39 bytes/quoted-id-with-comma ≈ 7,800 bytes,
 * leaving headroom for the JSON envelope. The count alone is a convenience
 * bound for a clear per-field error message; `assertSerializedSizeWithinLimit`
 * below is the actual enforced backstop, since only the real serialized size
 * — not the count — is what the database CHECK constraint sees.
 */
const MAX_SHEET_IDS = 100;

export interface SheetPreferences {
  /**
   * Sheet ids in the user's preferred display order. A sheet accessible to
   * the user but absent from this list sorts after every listed id (in the
   * server's own default order) — this list only ever needs to name sheets
   * the user has deliberately reordered, not every sheet they can see.
   */
  sheetOrder: string[];
  /** Sheet ids the user has hidden from their own dashboard. */
  hiddenSheetIds: string[];
}

export const DEFAULT_SHEET_PREFERENCES: SheetPreferences = {
  sheetOrder: [],
  hiddenSheetIds: [],
};

function sanitizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 100) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
    if (ids.length >= MAX_SHEET_IDS) break;
  }
  return ids;
}

/**
 * Validates a stored or incoming sheet-preferences document. Every field
 * falls back to its default independently — a malformed `hiddenSheetIds`
 * does not invalidate an otherwise-valid `sheetOrder` — matching the same
 * per-field-independent sanitization `sanitizePreferences` uses for the
 * device-local document.
 */
export function sanitizeSheetPreferences(input: unknown): SheetPreferences {
  const candidate =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    sheetOrder: sanitizeIdList(candidate.sheetOrder),
    hiddenSheetIds: sanitizeIdList(candidate.hiddenSheetIds),
  };
}

export function serializeSheetPreferences(prefs: SheetPreferences): string {
  return JSON.stringify(sanitizeSheetPreferences(prefs));
}

/**
 * The real enforced bound (M4-QA-05): a boundary-valid request under the
 * per-field id-count cap can still, in combination, serialize past the
 * database's own `preferences_json` CHECK (8,192 bytes) — the count cap is
 * only a friendlier error message, this is what actually protects the
 * write. Returns `false` (never throws) so callers can produce a stable
 * validation-error response rather than letting a boundary-valid request
 * reach D1 and fail a CHECK constraint as an opaque 500.
 *
 * Deliberately serializes `prefs` **as given**, not through
 * `sanitizeSheetPreferences` first — sanitizing before measuring would
 * silently truncate an oversized document down to a size that always
 * passes, which defeats the entire point of this check. The request
 * boundary (`parseSheetPreferences`) already guarantees well-formed input
 * by the time this normally runs; this function exists for the path where
 * that guarantee might not hold (a future internal caller, a stored
 * document whose shape predates today's bound), so it must measure the
 * actual bytes that would be written, not an idealized post-sanitize view.
 */
export function fitsSheetPreferencesSizeLimit(prefs: SheetPreferences): boolean {
  return JSON.stringify(prefs).length <= LIMITS.preferencesJson.max;
}

export function parseStoredSheetPreferences(preferencesJson: string): SheetPreferences {
  try {
    return sanitizeSheetPreferences(JSON.parse(preferencesJson) as unknown);
  } catch {
    return DEFAULT_SHEET_PREFERENCES;
  }
}
