import { describe, expect, it } from 'vitest';

import app from '../../src/server/index';
import { createMockEnv } from '../fixtures/mock-env';

describe('/api/v1 routing', () => {
  it('returns the stable JSON error envelope for an unknown API route', async () => {
    const res = await app.request('/api/v1/does-not-exist', {}, createMockEnv());

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.requestId).toBe('string');
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  it('defaults API responses to no-store', async () => {
    const res = await app.request('/api/v1/anything', {}, createMockEnv());

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('does not intercept requests outside the /api/v1 prefix', async () => {
    const res = await app.request('/some-non-api-path');

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).not.toBe('no-store');
  });
});
