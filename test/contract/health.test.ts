import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../../src/server/index';
import { EXPECTED_SCHEMA_VERSION } from '../../src/shared/constants/schema';
import { createMockEnv } from '../fixtures/mock-env';

describe('GET /api/v1/health', () => {
  it('reports ok with version/schema info when the schema is compatible', async () => {
    const res = await app.request('/api/v1/health', {}, createMockEnv({ schemaVersion: 1 }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      schemaVersion: number | null;
      expectedSchemaVersion: number;
      timestamp: string;
    };
    expect(body.status).toBe('ok');
    expect(body.schemaVersion).toBe(EXPECTED_SCHEMA_VERSION);
    expect(body.expectedSchemaVersion).toBe(EXPECTED_SCHEMA_VERSION);
    expect(typeof body.version).toBe('string');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports degraded (503) when the applied schema version does not match', async () => {
    const res = await app.request('/api/v1/health', {}, createMockEnv({ schemaVersion: 999 }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; schemaVersion: number | null };
    expect(body.status).toBe('degraded');
    expect(body.schemaVersion).toBe(999);
  });

  it('reports degraded (503) when no schema_version row exists yet', async () => {
    const res = await app.request('/api/v1/health', {}, createMockEnv({ schemaVersion: null }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; schemaVersion: number | null };
    expect(body.status).toBe('degraded');
    expect(body.schemaVersion).toBeNull();
  });

  it('never includes a binding ID, database name, or KV ID in the response', async () => {
    const res = await app.request('/api/v1/health', {}, createMockEnv());
    const text = await res.text();

    expect(text).not.toMatch(/database_id|DASH2_DB|DASH2_SESSIONS|dash2-preview|dash2-local/i);
  });

  it('reports degraded (503), not a 500, when the schema_version table does not exist yet (e.g. a freshly deployed, unmigrated database)', async () => {
    const env = createMockEnv({
      throwOnQuery: new Error('D1_ERROR: no such table: schema_version'),
    });

    const res = await app.request('/api/v1/health', {}, env);

    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; schemaVersion: number | null };
    expect(body.status).toBe('degraded');
    expect(body.schemaVersion).toBeNull();
  });

  describe('operational logging when the schema query fails', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('logs one request-correlated, code-only event on query failure, never the raw D1 error detail', async () => {
      const marker = 'D1_ERROR: private connection string or query detail';
      const env = createMockEnv({ throwOnQuery: new Error(marker) });

      const res = await app.request('/api/v1/health', {}, env);
      const requestId = res.headers.get('x-request-id');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logged).not.toMatch(/private connection string or query detail/);

      const parsed = JSON.parse(logged) as {
        requestId: string;
        path: string;
        status: number;
        code: string;
      };
      expect(parsed.requestId).toBe(requestId);
      expect(parsed.path).toBe('/api/v1/health');
      expect(parsed.status).toBe(503);
      expect(parsed.code).toBe('HEALTH_SCHEMA_QUERY_FAILED');
    });

    it('does not log anything for the routine case of a compatible schema', async () => {
      await app.request('/api/v1/health', {}, createMockEnv({ schemaVersion: 1 }));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
