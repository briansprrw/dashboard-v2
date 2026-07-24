import { describe, expect, it } from 'vitest';

import app from '../../src/server/index';
import type { Env } from '../../src/server/env';
import { createMockEnv } from '../fixtures/mock-env';

describe('environment/binding validation', () => {
  it('returns a generic 503 when a required binding is missing, with no binding names leaked', async () => {
    const brokenEnv: Env = { ...createMockEnv(), DASH2_DB: undefined as never };

    const res = await app.request('/api/v1/health', {}, brokenEnv);

    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      error: { code: string; message: string; fields?: object };
    };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.fields).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/DASH2_DB|DASH2_SESSIONS/);
  });

  it('does not throw a raw TypeError when env itself is entirely absent', async () => {
    const res = await app.request('/api/v1/health');

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
