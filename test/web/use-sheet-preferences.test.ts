import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSheetPreferences } from '../../src/web/state/use-sheet-preferences';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSheetPreferences (M4.3)', () => {
  it('loads the saved preferences', async () => {
    const stored = { sheetOrder: ['a', 'b'], hiddenSheetIds: ['b'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { preferences: stored })));

    const { result } = renderHook(() => useSheetPreferences(true));

    await waitFor(() => expect(result.current.loadState.status).toBe('ready'));
    expect(result.current.preferences).toEqual(stored);
  });

  it('does not fetch while disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetPreferences(false));

    expect(result.current.loadState.status).toBe('loading');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a load error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(500, { error: { code: 'INTERNAL', message: 'Server error.' } })
        )
    );

    const { result } = renderHook(() => useSheetPreferences(true));

    await waitFor(() => expect(result.current.loadState.status).toBe('error'));
  });

  it('save updates the in-memory preferences from the server response', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/users/me/sheet-preferences') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse(200, { preferences: { sheetOrder: ['x'], hiddenSheetIds: [] } })
        );
      }
      return Promise.resolve(
        jsonResponse(200, { preferences: { sheetOrder: [], hiddenSheetIds: [] } })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetPreferences(true));
    await waitFor(() => expect(result.current.loadState.status).toBe('ready'));

    await result.current.save({ sheetOrder: ['x'], hiddenSheetIds: [] });
    await waitFor(() =>
      expect(result.current.preferences).toEqual({ sheetOrder: ['x'], hiddenSheetIds: [] })
    );
  });
});
