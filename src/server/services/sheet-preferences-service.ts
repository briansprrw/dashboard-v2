// The one server-backed, cross-device preference V2 launches with: a user's
// own sheet order and hidden-sheet set (M4.3, M4-D3). Deliberately thin —
// this stores and returns exactly what `sanitizeSheetPreferences` validates,
// scoped strictly to the signed-in actor's own row. There is no path here (or
// anywhere else) that reads or writes another user's preferences.

import {
  DEFAULT_SHEET_PREFERENCES,
  fitsSheetPreferencesSizeLimit,
  parseStoredSheetPreferences,
  serializeSheetPreferences,
  SHEET_PREFERENCES_SCHEMA_VERSION,
  type SheetPreferences,
} from '../../shared/domain/sheet-preferences';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { denyForbidden, isEligible } from '../policy';
import type { ServiceDeps } from './service-context';

export class SheetPreferencesService {
  constructor(private readonly deps: ServiceDeps) {}

  async get(actor: Actor): Promise<SheetPreferences> {
    if (!isEligible(actor)) throw denyForbidden();

    const stored = await this.deps.repos.preferences.find(actor.userId);
    return stored === null
      ? DEFAULT_SHEET_PREFERENCES
      : parseStoredSheetPreferences(stored.preferencesJson);
  }

  async save(actor: Actor, prefs: SheetPreferences): Promise<SheetPreferences> {
    if (!isEligible(actor)) throw denyForbidden();

    // Defense in depth (M4-QA-05): `parseSheetPreferences` (the request
    // boundary) already rejects an oversized combined document, but this is
    // the actual last line of defense against the database's own CHECK
    // constraint — a boundary-valid request should never be able to reach
    // D1 and fail there as an opaque, unhandled constraint violation.
    if (!fitsSheetPreferencesSizeLimit(prefs)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Combined sheetOrder and hiddenSheetIds are too large to store.'
      );
    }

    const saved = await this.deps.repos.preferences.upsert({
      userId: actor.userId,
      preferencesJson: serializeSheetPreferences(prefs),
      schemaVersion: SHEET_PREFERENCES_SCHEMA_VERSION,
      now: this.deps.clock(),
    });
    return parseStoredSheetPreferences(saved.preferencesJson);
  }
}
