// Thin fetch wrapper for every `/api/v1/*` call the client makes.
//
// One function, `apiRequest`, is the only place that talks to `fetch`. Every
// data hook in `src/web/hooks` and `src/web/state` goes through it so the
// error shape (`ApiError`) and credential/origin handling are consistent
// everywhere, per M3.1's "centralize task queries/mutations" outcome.

const API_BASE = '/api/v1';

/**
 * Mirrors the server's `ErrorEnvelope` (`src/server/errors/error-envelope.ts`)
 * without importing across the client/server boundary — the wire shape is
 * the contract, not the server module.
 */
interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
}

/**
 * Thrown for every non-2xx response. Carries the server's stable error code
 * so callers can branch on it (e.g. `UNAUTHENTICATED` to drop to the
 * logged-out state) without parsing prose.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Thrown when `fetch` itself fails (offline, DNS, connection reset). */
export class ApiNetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed.');
    this.name = 'ApiNetworkError';
    this.cause = cause;
  }
}

export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Issues one `/api/v1` request and returns the parsed JSON body.
 *
 * Always sends cookies (`credentials: 'include'`) since sessions are
 * cookie-based; never sends a body on GET. A non-2xx response is parsed as
 * `ErrorEnvelope` and re-thrown as `ApiError` so callers get a typed,
 * actionable failure instead of a raw `Response`.
 */
export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (error) {
    throw new ApiNetworkError(error);
  }

  if (!response.ok) {
    let envelope: ErrorEnvelope | null;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      envelope = null;
    }

    if (envelope?.error) {
      throw new ApiError(
        response.status,
        envelope.error.code,
        envelope.error.message,
        envelope.error.fields
      );
    }
    throw new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      `Request failed with status ${response.status}.`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
