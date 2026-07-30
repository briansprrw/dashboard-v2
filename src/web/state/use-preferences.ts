// Reads and writes the device-local preferences document in `localStorage`.
// This is the only module that touches the storage key directly — every
// component reads/updates preferences through this hook so the corrupt-JSON
// recovery and validation rules in `preferences-schema.ts` are applied
// consistently everywhere (M0-D9: never sent to the server).

import { useCallback, useState } from 'react';

import type { TaskPriority, TaskStatus } from '../../shared/domain/enums';
import {
  DEFAULT_PREFERENCES,
  clampClosedTaskDays,
  clampColumnBounds,
  clampRefreshInterval,
  sanitizePreferences,
  validateDueThresholds,
  type ClosedTaskVisibility,
  type ColumnBounds,
  type DueThresholds,
  type Preferences,
} from './preferences-schema';

const STORAGE_KEY = 'dash2.preferences.v1';

function readStorage(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PREFERENCES;
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    // Corrupt JSON, a quota error, or storage being unavailable all fall
    // back to defaults rather than crashing the app on read.
    return DEFAULT_PREFERENCES;
  }
}

function writeStorage(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // A write failure (quota, private-browsing mode) is not fatal: the
    // in-memory state below still updates for this session.
  }
}

export interface UsePreferencesResult {
  preferences: Preferences;
  setMode: (mode: Preferences['mode']) => void;
  setZoom: (zoom: number) => void;
  setDensity: (density: Preferences['density']) => void;
  setTheme: (theme: Preferences['theme']) => void;
  toggleSheetCollapsed: (sheetId: string) => void;
  /** Returns `false` and leaves the prior value in place when `thresholds` is invalid. */
  setDueThresholds: (thresholds: DueThresholds) => boolean;
  setColumnBounds: (bounds: ColumnBounds) => void;
  setRefreshInterval: (ms: number) => void;
  setShowClock: (showClock: boolean) => void;
  setEmojiOverride(kind: 'status', key: TaskStatus, emoji: string | null): void;
  setEmojiOverride(kind: 'priority', key: TaskPriority, emoji: string | null): void;
  setClosedTaskVisibility: (
    status: 'complete' | 'cancelled',
    visibility: ClosedTaskVisibility
  ) => void;
}

export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<Preferences>(() => readStorage());

  const update = useCallback((next: Preferences) => {
    setPreferences(next);
    writeStorage(next);
  }, []);

  const setMode = useCallback(
    (mode: Preferences['mode']) => update({ ...preferences, mode }),
    [preferences, update]
  );

  const setZoom = useCallback(
    (zoom: number) => update({ ...preferences, zoom }),
    [preferences, update]
  );

  const setDensity = useCallback(
    (density: Preferences['density']) => update({ ...preferences, density }),
    [preferences, update]
  );

  const setTheme = useCallback(
    (theme: Preferences['theme']) => update({ ...preferences, theme }),
    [preferences, update]
  );

  const toggleSheetCollapsed = useCallback(
    (sheetId: string) => {
      const isCollapsed = preferences.collapsedSheetIds.includes(sheetId);
      const collapsedSheetIds = isCollapsed
        ? preferences.collapsedSheetIds.filter((id) => id !== sheetId)
        : [...preferences.collapsedSheetIds, sheetId];
      update({ ...preferences, collapsedSheetIds });
    },
    [preferences, update]
  );

  const setDueThresholds = useCallback(
    (thresholds: DueThresholds) => {
      const valid = validateDueThresholds(thresholds);
      if (valid === null) return false;
      update({ ...preferences, dueThresholds: valid });
      return true;
    },
    [preferences, update]
  );

  const setColumnBounds = useCallback(
    (bounds: ColumnBounds) => update({ ...preferences, columnBounds: clampColumnBounds(bounds) }),
    [preferences, update]
  );

  const setRefreshInterval = useCallback(
    (ms: number) => update({ ...preferences, refreshIntervalMs: clampRefreshInterval(ms) }),
    [preferences, update]
  );

  const setShowClock = useCallback(
    (showClock: boolean) => update({ ...preferences, showClock }),
    [preferences, update]
  );

  const setEmojiOverride = useCallback(
    (kind: 'status' | 'priority', key: TaskStatus | TaskPriority, emoji: string | null) => {
      const current = preferences.emojiOverrides[kind] as Record<string, string>;
      const next = { ...current };
      if (emoji === null || emoji.length === 0) {
        delete next[key];
      } else {
        next[key] = emoji;
      }
      update({
        ...preferences,
        emojiOverrides: { ...preferences.emojiOverrides, [kind]: next },
      });
    },
    [preferences, update]
  );

  const setClosedTaskVisibility = useCallback(
    (status: 'complete' | 'cancelled', visibility: ClosedTaskVisibility) => {
      const sanitized: ClosedTaskVisibility = {
        mode: visibility.mode,
        days: clampClosedTaskDays(visibility.days),
      };
      update({
        ...preferences,
        closedTaskVisibility: { ...preferences.closedTaskVisibility, [status]: sanitized },
      });
    },
    [preferences, update]
  );

  return {
    preferences,
    setMode,
    setZoom,
    setDensity,
    setTheme,
    toggleSheetCollapsed,
    setDueThresholds,
    setColumnBounds,
    setRefreshInterval,
    setShowClock,
    setEmojiOverride,
    setClosedTaskVisibility,
  };
}
