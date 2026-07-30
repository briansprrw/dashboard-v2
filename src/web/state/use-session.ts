// Owns the signed-in session bootstrap: the first fetch every app load makes,
// and the source of the app's logged-out/loading/ready/error top-level state.

import { useCallback, useEffect, useState } from 'react';

import type { SessionUserDto } from '../../shared/contracts/dto';
import { api } from '../lib/api';
import { ApiError, ApiNetworkError } from '../lib/api-client';

export type SessionState =
  | { status: 'loading' }
  | { status: 'logged-out' }
  | { status: 'ready'; user: SessionUserDto }
  | { status: 'error'; message: string };

export interface UseSessionResult {
  session: SessionState;
  /** Re-fetches the session, e.g. after a background 401 or a manual retry. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * `UNAUTHENTICATED` (401) is expected and maps to `logged-out`, the ordinary
 * state for a visitor with no cookie or an expired/revoked one — including
 * the disabled-account case, since `denyUnauthenticated` is deliberately the
 * same response for every "no usable session" reason. Any other failure
 * (network, unexpected status) maps to `error` so it is visibly distinct from
 * "you are not signed in."
 */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setSession((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const { user } = await api.session.get();
      setSession({ status: 'ready', user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession({ status: 'logged-out' });
        return;
      }
      setSession({ status: 'error', message: sessionErrorMessage(error) });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.session.logout();
    } finally {
      setSession({ status: 'logged-out' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { user } = await api.session.get();
        if (!cancelled) setSession({ status: 'ready', user });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setSession({ status: 'logged-out' });
          return;
        }
        setSession({ status: 'error', message: sessionErrorMessage(error) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, refresh, logout };
}

function sessionErrorMessage(error: unknown): string {
  if (error instanceof ApiNetworkError) return 'Could not reach the server.';
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong loading your session.';
}
