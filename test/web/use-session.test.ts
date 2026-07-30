import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '../../src/web/state/use-session';
import { makeSessionUser } from './fixtures';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSession', () => {
  it('resolves to ready with the session user on a successful fetch', async () => {
    const user = makeSessionUser();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { user })));

    const { result } = renderHook(() => useSession());

    expect(result.current.session.status).toBe('loading');
    await waitFor(() => expect(result.current.session.status).toBe('ready'));
    expect(result.current.session).toEqual({ status: 'ready', user });
  });

  it('resolves to logged-out on a 401 — the expired/disabled/absent-session case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication is required.',
            requestId: 'r1',
          },
        })
      )
    );

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.session.status).toBe('logged-out'));
  });

  it('resolves to error on a network failure, distinct from logged-out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.session.status).toBe('error'));
    expect(result.current.session).toMatchObject({
      status: 'error',
      message: 'Could not reach the server.',
    });
  });
});
