// Loads and saves the signed-in user's server-backed sheet order/visibility
// (M4.3, M4-D3). Distinct from `use-preferences.ts`, which is entirely
// localStorage/device-local (M0-D9) and never touches the network — this
// hook is the one place that reads or writes `/api/v1/users/me/sheet-preferences`.

import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_SHEET_PREFERENCES,
  type SheetPreferences,
} from '../../shared/domain/sheet-preferences';
import { api } from '../lib/api';
import { ApiError } from '../lib/api-client';

export type SheetPreferencesLoadState =
  { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

export interface UseSheetPreferencesResult {
  preferences: SheetPreferences;
  loadState: SheetPreferencesLoadState;
  save: (next: SheetPreferences) => Promise<void>;
}

/** Only fetches while `enabled` — gate on the session being ready, matching `useSheetsData`. */
export function useSheetPreferences(enabled: boolean): UseSheetPreferencesResult {
  const [preferences, setPreferences] = useState<SheetPreferences>(DEFAULT_SHEET_PREFERENCES);
  const [loadState, setLoadState] = useState<SheetPreferencesLoadState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      setLoadState({ status: 'loading' });
      try {
        const { preferences: loaded } = await api.users.getSheetPreferences();
        if (cancelled) return;
        setPreferences(loaded);
        setLoadState({ status: 'ready' });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load your sheet preferences.',
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const save = useCallback(async (next: SheetPreferences) => {
    const { preferences: saved } = await api.users.saveSheetPreferences(next);
    setPreferences(saved);
  }, []);

  return { preferences, loadState, save };
}
