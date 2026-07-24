import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppEnv } from '../../src/server/env';
import { onError } from '../../src/server/errors/on-error';
import { requestId } from '../../src/server/middleware/request-id';
import { securityHeaders } from '../../src/server/middleware/security-headers';

// health.ts (the only real /api/v1 route in M1) deliberately catches its own
// D1 errors and reports a degraded health status rather than throwing (see
// health.test.ts) — so it can no longer be used to exercise onError's
// generic/unexpected-exception path. This isolated app wires the same
// onError handler and middleware onto a deliberately throwing test route to
// verify that path directly, without depending on any real route's
// internals.
function buildThrowingTestApp(thrown: unknown) {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.use('*', requestId);
  app.use('*', securityHeaders);
  app.get('/boom', () => {
    throw thrown;
  });
  return app;
}

describe('unexpected errors', () => {
  it('never leaks the original error message/stack to the client', async () => {
    const app = buildThrowingTestApp(new Error('super secret internal detail'));

    const res = await app.request('/boom');

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toMatch(/super secret internal detail/);
  });

  it('still attaches the baseline security headers and a request ID to an unexpected-error response', async () => {
    const app = buildThrowingTestApp(new Error('boom'));

    const res = await app.request('/boom');

    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  describe('server-side logging of unexpected exceptions', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('never logs the raw exception message, even when it contains private/secret-shaped content', async () => {
      const marker = 'PRIVATE_TASK_CONTENT_MARKER';
      const app = buildThrowingTestApp(new Error(`task note: ${marker}`));

      await app.request('/boom');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = consoleErrorSpy.mock.calls[0]?.[0];
      expect(typeof logged).toBe('string');
      expect(logged as string).not.toMatch(new RegExp(marker));
      expect(logged as string).not.toMatch(/task note/);
    });

    it('never logs a private/secret-shaped value even when it is written into Error.name (not just .message)', async () => {
      // Codex independent QA (2026-07-24) reproduced a real gap in the
      // first fix: logging `err.name` directly is not safe, because
      // `.name` is an ordinary mutable property just like `.message` — any
      // thrown value can set it to arbitrary content.
      const marker = 'PRIVATE_TASK_CONTENT_MARKER';
      const thrown = new Error('some message');
      thrown.name = marker;
      const app = buildThrowingTestApp(thrown);

      await app.request('/boom');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = consoleErrorSpy.mock.calls[0]?.[0];
      expect(typeof logged).toBe('string');
      expect(logged as string).not.toMatch(new RegExp(marker));
      const parsed = JSON.parse(logged as string) as { detail: { errorCategory: string } };
      expect(parsed.detail.errorCategory).toBe('UnexpectedError');
    });

    it('still logs request ID, route, status, and a coarse error category for unexpected exceptions', async () => {
      const app = buildThrowingTestApp(new Error('boom'));

      const res = await app.request('/boom');
      const requestId = res.headers.get('x-request-id');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string) as {
        requestId: string;
        path: string;
        status: number;
        code: string;
        detail: { errorCategory: string };
      };
      expect(logged.requestId).toBe(requestId);
      expect(logged.path).toBe('/boom');
      expect(logged.status).toBe(500);
      expect(logged.code).toBe('INTERNAL_ERROR');
      expect(logged.detail.errorCategory).toBe('Error');
    });

    it('surfaces a recognized built-in error name (diagnostic value) while still rejecting unrecognized ones', async () => {
      const app = buildThrowingTestApp(new TypeError('boom'));

      await app.request('/boom');

      const logged = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string) as {
        detail: { errorCategory: string };
      };
      expect(logged.detail.errorCategory).toBe('TypeError');
    });

    it('reads Error.name at most once, so a stateful accessor cannot pass the allowlist check with a safe value and then return private content on a second read', async () => {
      // Codex Re-review (2026-07-24) reproduced this exact gap: the first
      // allowlist fix read `err.name` twice (once to check membership, once
      // to return it), so a getter could answer differently each time.
      let readCount = 0;
      const thrown = new Error('some message');
      Object.defineProperty(thrown, 'name', {
        get() {
          readCount += 1;
          return readCount === 1 ? 'Error' : 'PRIVATE_TASK_CONTENT_MARKER';
        },
      });
      const app = buildThrowingTestApp(thrown);

      await app.request('/boom');

      expect(readCount).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logged).not.toMatch(/PRIVATE_TASK_CONTENT_MARKER/);
      const parsed = JSON.parse(logged) as { detail: { errorCategory: string } };
      expect(parsed.detail.errorCategory).toBe('Error');
    });
  });
});
