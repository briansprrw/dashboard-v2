import { describe, expect, it } from 'vitest';

import app from '../../src/server/index';
import { createMockEnv } from '../fixtures/mock-env';

describe('baseline security headers on /api/v1 responses', () => {
  it('sets the full baseline header set, including on an error response', async () => {
    // Deliberately an unknown route (404) — headers must apply even on the
    // error path, not only on successful responses.
    const res = await app.request('/api/v1/does-not-exist', {}, createMockEnv());

    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('geolocation=()');
  });

  it('does not set the API security-header set outside /api/v1', async () => {
    const res = await app.request('/some-non-api-path');

    expect(res.headers.get('content-security-policy')).toBeNull();
  });
});

describe('X-Request-Id', () => {
  it('attaches a unique request ID header to every /api/v1 response', async () => {
    const res1 = await app.request('/api/v1/health', {}, createMockEnv());
    const res2 = await app.request('/api/v1/health', {}, createMockEnv());

    const id1 = res1.headers.get('x-request-id');
    const id2 = res2.headers.get('x-request-id');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('the response header matches the request ID in an error envelope', async () => {
    const res = await app.request('/api/v1/does-not-exist', {}, createMockEnv());
    const headerId = res.headers.get('x-request-id');
    const body = (await res.json()) as { error: { requestId: string } };

    expect(body.error.requestId).toBe(headerId);
  });
});
