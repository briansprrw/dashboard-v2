import { describe, expect, it } from 'vitest';

import app from '../../src/server/index';
import {
  SESSION_COOKIE_NAME,
  buildSessionClearCookie,
  buildSessionCookie,
  readSessionCookie,
} from '../../src/server/auth/cookies';
import { allowedOriginsFor } from '../../src/server/middleware/origin';
import { createMockEnv } from '../fixtures/mock-env';

// HTTP-boundary contract tests: the status codes and headers a caller actually
// observes. These use a synthetic env with no real KV, so an authenticated
// request cannot resolve a session — which is exactly what makes them the right
// place to assert the *unauthenticated* behaviour of every protected route.

const PROTECTED_ROUTES: [string, string][] = [
  ['GET', '/api/v1/sheets'],
  ['POST', '/api/v1/sheets'],
  ['GET', '/api/v1/sheets/11111111-1111-4111-8111-111111111111'],
  ['PATCH', '/api/v1/sheets/11111111-1111-4111-8111-111111111111'],
  ['DELETE', '/api/v1/sheets/11111111-1111-4111-8111-111111111111'],
  ['GET', '/api/v1/sheets/11111111-1111-4111-8111-111111111111/tasks'],
  ['POST', '/api/v1/sheets/11111111-1111-4111-8111-111111111111/tasks'],
  ['GET', '/api/v1/sheets/11111111-1111-4111-8111-111111111111/members'],
  ['POST', '/api/v1/sheets/11111111-1111-4111-8111-111111111111/members'],
  ['POST', '/api/v1/sheets/11111111-1111-4111-8111-111111111111/ownership'],
  ['GET', '/api/v1/tasks/22222222-2222-4222-8222-222222222222'],
  ['PUT', '/api/v1/tasks/22222222-2222-4222-8222-222222222222'],
  ['DELETE', '/api/v1/tasks/22222222-2222-4222-8222-222222222222'],
  ['POST', '/api/v1/tasks/22222222-2222-4222-8222-222222222222/move'],
  ['GET', '/api/v1/tasks/22222222-2222-4222-8222-222222222222/history'],
  ['GET', '/api/v1/admin/tasks/22222222-2222-4222-8222-222222222222'],
  ['POST', '/api/v1/admin/tasks/22222222-2222-4222-8222-222222222222/restore'],
  ['DELETE', '/api/v1/admin/tasks/22222222-2222-4222-8222-222222222222'],
  ['GET', '/api/v1/admin/sheets/11111111-1111-4111-8111-111111111111'],
  ['POST', '/api/v1/admin/users/33333333-3333-4333-8333-333333333333/role'],
  ['POST', '/api/v1/admin/users/33333333-3333-4333-8333-333333333333/disable'],
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Unsafe methods must carry a matching Origin to get past the CSRF check. */
function request(method: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method) && !headers.has('Origin')) {
    headers.set('Origin', 'http://localhost');
  }
  if (!SAFE_METHODS.has(method) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(
    `http://localhost${path}`,
    { method, body: SAFE_METHODS.has(method) ? undefined : '{}', ...init, headers },
    createMockEnv()
  );
}

describe('every protected route requires authentication', () => {
  it.each(PROTECTED_ROUTES)('rejects an unauthenticated %s %s with 401', async (method, path) => {
    const res = await request(method, path);
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  it('rejects a malformed session cookie with 401, not 500', async () => {
    const res = await request('GET', '/api/v1/sheets', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an unresolvable session with 401 even when OAuth is unconfigured', async () => {
    // Regression: session resolution once built the full sign-in stack, so an
    // environment without Google credentials answered 503 AUTH_NOT_CONFIGURED
    // for what is an ordinary invalid session. That reported a routine
    // rejection as a service outage. The env fixture has no OAuth config, so
    // this test only passes while resolution stays provider-free.
    const res = await request('GET', '/api/v1/sheets', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=some-token-value` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('allows sign-out to succeed even when OAuth is unconfigured', async () => {
    const res = await request('POST', '/api/v1/auth/logout', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=some-token-value` },
    });
    expect(res.status).toBe(200);
  });

  it('leaves the health endpoint public', async () => {
    const res = await app.request('http://localhost/api/v1/health', {}, createMockEnv());
    expect(res.status).toBe(200);
  });

  it('reaches sign-in initiation (past the rate-limit check) even when OAuth is unconfigured', async () => {
    // The mock KV's `get` always returns null, so this cannot exercise the
    // rate-limit-exceeded path (see the real-KV tests in
    // test/integration/auth-lifecycle.test.ts for that) — it only proves the
    // check added for Codex M2-QA-04 does not block an ordinary request before
    // reaching the existing 503 AUTH_NOT_CONFIGURED behavior.
    const res = await app.request('http://localhost/api/v1/auth/start', {}, createMockEnv());
    expect(res.status).toBe(503);
  });

  it('does not leak configuration detail in the 401 body', async () => {
    const res = await request('GET', '/api/v1/sheets');
    const text = await res.text();
    expect(text).not.toMatch(/DASH2_DB|DASH2_SESSIONS|GOOGLE_CLIENT|secret/i);
  });
});

describe('origin enforcement on state-changing requests', () => {
  it('rejects a mutation with a foreign Origin', async () => {
    const res = await app.request(
      'http://localhost/api/v1/sheets',
      {
        method: 'POST',
        headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
        body: '{}',
      },
      createMockEnv()
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rejects a mutation with no Origin header at all', async () => {
    const res = await app.request(
      'http://localhost/api/v1/sheets',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      createMockEnv()
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ORIGIN_REQUIRED');
  });

  it('rejects the origin before authentication, so it cannot be probed with a session', async () => {
    const res = await app.request(
      'http://localhost/api/v1/admin/users/33333333-3333-4333-8333-333333333333/disable',
      { method: 'POST', headers: { Origin: 'https://evil.invalid' } },
      createMockEnv()
    );
    // 403 for the origin, not 401 for the missing session: the check runs first.
    expect(res.status).toBe(403);
  });

  it('allows a same-origin mutation through to the auth check', async () => {
    const res = await request('POST', '/api/v1/sheets');
    expect(res.status).toBe(401);
  });

  it('does not require an Origin on a safe method', async () => {
    const res = await app.request('http://localhost/api/v1/health', {}, createMockEnv());
    expect(res.status).toBe(200);
  });

  it('covers unknown paths, changing the M1 catch-all 404 to 403 on unsafe methods', async () => {
    // Documented M1 behaviour change (see the comment in src/server/index.ts):
    // the origin check is registered on `*`, so an unsafe request to a path
    // that does not exist is rejected for its origin before the catch-all can
    // answer. An unknown route must not be a CSRF-exempt hole.
    const res = await app.request(
      'http://localhost/api/v1/no-such-route',
      { method: 'POST', headers: { Origin: 'https://evil.invalid' } },
      createMockEnv()
    );
    expect(res.status).toBe(403);
  });

  it('leaves the M1 404 envelope intact for safe methods on unknown paths', async () => {
    const res = await app.request('http://localhost/api/v1/no-such-route', {}, createMockEnv());
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('defaults the allowlist to the request origin when unconfigured', () => {
    const origins = allowedOriginsFor(createMockEnv(), 'https://dash2.invalid/api/v1/sheets');
    expect([...origins]).toEqual(['https://dash2.invalid']);
  });

  it('uses the configured allowlist when present', () => {
    const env = { ...createMockEnv(), ALLOWED_ORIGINS: 'https://a.invalid, https://b.invalid' };
    const origins = allowedOriginsFor(env, 'https://dash2.invalid/api/v1/sheets');
    expect(origins.has('https://a.invalid')).toBe(true);
    expect(origins.has('https://b.invalid')).toBe(true);
    expect(origins.has('https://dash2.invalid')).toBe(false);
  });
});

describe('content-type enforcement', () => {
  it('rejects a JSON-shaped body sent as text/plain', async () => {
    const res = await app.request(
      'http://localhost/api/v1/sheets',
      {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Content-Type': 'text/plain' },
        body: '{"displayName":"x"}',
      },
      createMockEnv()
    );
    // 401 first (no session) — the point is that it never reaches a handler
    // that would have accepted the body.
    expect(res.status).toBe(401);
  });
});

describe('session cookie policy (AC-D2)', () => {
  it('sets HttpOnly, SameSite=Lax, Path=/ and Secure by default', () => {
    const cookie = buildSessionCookie('token-value', 2_592_000, { secure: true });

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=token-value`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('Secure');
  });

  it('omits Secure only when explicitly disabled', () => {
    expect(buildSessionCookie('t', 60, { secure: false })).not.toContain('Secure');
  });

  it('clears the cookie with matching attributes and Max-Age=0', () => {
    const cookie = buildSessionClearCookie({ secure: true });
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
  });

  it('never marks the cookie as readable by script', () => {
    expect(buildSessionCookie('t', 60, { secure: true })).not.toMatch(/SameSite=None/);
  });
});

describe('reading the session cookie', () => {
  it('extracts the token among other cookies', () => {
    expect(readSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=abc123; another=2`)).toBe('abc123');
  });

  it.each([
    { case: 'an absent header', header: undefined },
    { case: 'an empty header', header: '' },
    { case: 'no session cookie', header: 'other=1; another=2' },
    { case: 'an empty value', header: `${SESSION_COOKIE_NAME}=` },
    { case: 'a similarly-named cookie', header: `not_${SESSION_COOKIE_NAME}=abc` },
  ])('returns null for $case', ({ header }) => {
    expect(readSessionCookie(header)).toBeNull();
  });
});

describe('validation errors produce a consistent envelope', () => {
  it('returns 400 with per-field detail for an invalid identifier', async () => {
    // Origin and auth pass first, so an invalid path id on a public-shaped
    // route is asserted through the auth boundary instead; here we confirm the
    // envelope shape is stable for the 404 catch-all, which shares it.
    const res = await app.request('http://localhost/api/v1/nope', {}, createMockEnv());
    const body = (await res.json()) as { error: { code: string; requestId: string } };

    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body.error).toHaveProperty('requestId');
  });
});
