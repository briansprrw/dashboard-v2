import { describe, expect, it } from 'vitest';

import {
  clampColumnBounds,
  clampRefreshInterval,
  DEFAULT_PREFERENCES,
  DUE_THRESHOLD_MAX_DAYS,
  REFRESH_INTERVAL_MAX_MS,
  REFRESH_INTERVAL_MIN_MS,
  sanitizePreferences,
  validateDueThresholds,
} from '../../src/web/state/preferences-schema';

describe('validateDueThresholds', () => {
  it('accepts a valid ordered, bounded set', () => {
    expect(validateDueThresholds({ soonMaxDays: 3, soonishMaxDays: 7 })).toEqual({
      soonMaxDays: 3,
      soonishMaxDays: 7,
    });
  });

  it('rejects a set where soon is not strictly before soonish', () => {
    expect(validateDueThresholds({ soonMaxDays: 7, soonishMaxDays: 7 })).toBeNull();
    expect(validateDueThresholds({ soonMaxDays: 8, soonishMaxDays: 7 })).toBeNull();
  });

  it('rejects non-positive or non-integer values', () => {
    expect(validateDueThresholds({ soonMaxDays: 0, soonishMaxDays: 7 })).toBeNull();
    expect(validateDueThresholds({ soonMaxDays: -1, soonishMaxDays: 7 })).toBeNull();
    expect(validateDueThresholds({ soonMaxDays: 1.5, soonishMaxDays: 7 })).toBeNull();
  });

  it('rejects malformed input shapes', () => {
    expect(validateDueThresholds(null)).toBeNull();
    expect(validateDueThresholds('nope')).toBeNull();
    expect(validateDueThresholds({ soonMaxDays: '3', soonishMaxDays: 7 })).toBeNull();
  });

  it('accepts values at the 365-day maximum', () => {
    expect(
      validateDueThresholds({
        soonMaxDays: DUE_THRESHOLD_MAX_DAYS - 1,
        soonishMaxDays: DUE_THRESHOLD_MAX_DAYS,
      })
    ).toEqual({ soonMaxDays: DUE_THRESHOLD_MAX_DAYS - 1, soonishMaxDays: DUE_THRESHOLD_MAX_DAYS });
  });

  it('rejects values above the 365-day maximum', () => {
    expect(
      validateDueThresholds({ soonMaxDays: DUE_THRESHOLD_MAX_DAYS + 1, soonishMaxDays: 7 })
    ).toBeNull();
    expect(
      validateDueThresholds({
        soonMaxDays: 3,
        soonishMaxDays: DUE_THRESHOLD_MAX_DAYS + 1,
      })
    ).toBeNull();
  });
});

describe('clampColumnBounds', () => {
  it('clamps max to the firm 1-3 ceiling', () => {
    expect(clampColumnBounds({ min: 1, max: 5 })).toEqual({ min: 1, max: 3 });
  });

  it('never lets min exceed max', () => {
    expect(clampColumnBounds({ min: 3, max: 1 })).toEqual({ min: 1, max: 1 });
  });

  it('clamps below-1 values up to 1', () => {
    expect(clampColumnBounds({ min: 0, max: 0 })).toEqual({ min: 1, max: 1 });
  });
});

describe('sanitizePreferences', () => {
  it('returns defaults for completely invalid input', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('garbage')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it('falls back field-by-field rather than rejecting the whole document', () => {
    const result = sanitizePreferences({
      mode: 'glance',
      zoom: 'not-a-number',
      density: 'compact',
      theme: 'not-a-theme',
      dueThresholds: { soonMaxDays: 7, soonishMaxDays: 3 },
    });
    expect(result.mode).toBe('glance');
    expect(result.zoom).toBe(DEFAULT_PREFERENCES.zoom);
    expect(result.density).toBe('compact');
    expect(result.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(result.dueThresholds).toEqual(DEFAULT_PREFERENCES.dueThresholds);
  });

  it('clamps out-of-range zoom back to the default rather than accepting it', () => {
    expect(sanitizePreferences({ zoom: 99 }).zoom).toBe(DEFAULT_PREFERENCES.zoom);
    expect(sanitizePreferences({ zoom: -99 }).zoom).toBe(DEFAULT_PREFERENCES.zoom);
  });

  it('filters non-string entries out of collapsedSheetIds', () => {
    const result = sanitizePreferences({ collapsedSheetIds: ['a', 42, 'b', null] });
    expect(result.collapsedSheetIds).toEqual(['a', 'b']);
  });

  it('clamps an out-of-range refreshIntervalMs instead of rejecting the whole document', () => {
    expect(sanitizePreferences({ refreshIntervalMs: 1000 }).refreshIntervalMs).toBe(
      REFRESH_INTERVAL_MIN_MS
    );
    expect(sanitizePreferences({ refreshIntervalMs: 999_999_999 }).refreshIntervalMs).toBe(
      REFRESH_INTERVAL_MAX_MS
    );
  });

  it('falls back to the default refreshIntervalMs for a non-numeric value', () => {
    expect(sanitizePreferences({ refreshIntervalMs: 'soon' }).refreshIntervalMs).toBe(
      DEFAULT_PREFERENCES.refreshIntervalMs
    );
  });
});

describe('sanitizePreferences — M3-QA-03 fields', () => {
  it('defaults showClock to false and falls back for a non-boolean value', () => {
    expect(sanitizePreferences({}).showClock).toBe(false);
    expect(sanitizePreferences({ showClock: 'yes' }).showClock).toBe(false);
  });

  it('preserves a valid showClock value', () => {
    expect(sanitizePreferences({ showClock: true }).showClock).toBe(true);
  });

  it('keeps only known-key, non-empty-string emoji overrides', () => {
    const result = sanitizePreferences({
      emojiOverrides: {
        status: { complete: '🎉', not_a_status: '👻', in_progress: '' },
        priority: { urgent: '🔥', not_a_priority: '💀' },
      },
    });
    expect(result.emojiOverrides).toEqual({
      status: { complete: '🎉' },
      priority: { urgent: '🔥' },
    });
  });

  it('sanitizes closed-task visibility per status independently, clamping an out-of-range days value', () => {
    const result = sanitizePreferences({
      closedTaskVisibility: {
        complete: { mode: 'days', days: 999 },
        cancelled: { mode: 'hide', days: 5 },
      },
    });
    expect(result.closedTaskVisibility).toEqual({
      complete: { mode: 'days', days: 90 },
      cancelled: { mode: 'hide', days: 5 },
    });
  });

  it('falls back to the default closed-task visibility for a malformed mode', () => {
    const result = sanitizePreferences({
      closedTaskVisibility: { complete: { mode: 'not-a-mode', days: 3 } },
    });
    expect(result.closedTaskVisibility.complete).toEqual({ mode: 'always', days: 3 });
  });
});

describe('clampRefreshInterval', () => {
  it('clamps below the 10s floor', () => {
    expect(clampRefreshInterval(5000)).toBe(REFRESH_INTERVAL_MIN_MS);
  });

  it('clamps above the 10min ceiling', () => {
    expect(clampRefreshInterval(20 * 60_000)).toBe(REFRESH_INTERVAL_MAX_MS);
  });

  it('passes through an in-range value unchanged', () => {
    expect(clampRefreshInterval(90_000)).toBe(90_000);
  });
});
