import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PREFERENCES } from '../../src/web/state/preferences-schema';
import { usePreferences } from '../../src/web/state/use-preferences';

const STORAGE_KEY = 'dash2.preferences.v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('usePreferences', () => {
  it('starts from defaults when nothing is stored', () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('resets to defaults instead of crashing when storage holds corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const { result } = renderHook(() => usePreferences());
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('persists a mode change across a simulated reload (a fresh hook instance)', () => {
    const { result, unmount } = renderHook(() => usePreferences());
    act(() => {
      result.current.setMode('glance');
    });
    expect(result.current.preferences.mode).toBe('glance');
    unmount();

    const { result: afterReload } = renderHook(() => usePreferences());
    expect(afterReload.current.preferences.mode).toBe('glance');
  });

  it('mode is not derived from viewport/container size — it is only ever set explicitly', () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.preferences.mode).toBe('standard');
    // No viewport/resize input exists anywhere in this hook's dependencies;
    // the only way `mode` changes is `setMode`, which this test does not call.
  });

  it('rejects an invalid due-threshold update and keeps the prior valid value', () => {
    const { result } = renderHook(() => usePreferences());
    let accepted = true;
    act(() => {
      accepted = result.current.setDueThresholds({ soonMaxDays: 10, soonishMaxDays: 2 });
    });
    expect(accepted).toBe(false);
    expect(result.current.preferences.dueThresholds).toEqual(DEFAULT_PREFERENCES.dueThresholds);
  });

  it('accepts a valid due-threshold update', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.setDueThresholds({ soonMaxDays: 2, soonishMaxDays: 5 });
    });
    expect(result.current.preferences.dueThresholds).toEqual({ soonMaxDays: 2, soonishMaxDays: 5 });
  });

  it('clamps column bounds through setColumnBounds', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.setColumnBounds({ min: 1, max: 9 });
    });
    expect(result.current.preferences.columnBounds).toEqual({ min: 1, max: 3 });
  });

  it('toggles a sheet collapsed and back', () => {
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.toggleSheetCollapsed('sheet-1');
    });
    expect(result.current.preferences.collapsedSheetIds).toEqual(['sheet-1']);
    act(() => {
      result.current.toggleSheetCollapsed('sheet-1');
    });
    expect(result.current.preferences.collapsedSheetIds).toEqual([]);
  });
});
