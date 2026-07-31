import { describe, expect, it } from 'vitest';

import { buildAuditPage } from '../../src/server/routes/admin';
import { resolveAuditLimit } from '../../src/server/services/admin-audit-service';
import type { AuditEventRecord } from '../../src/shared/domain/records';

// Codex M4-RR-02: the audit route's `nextCursor` must be derived from the page
// size the query actually used, not from the caller's raw `?limit=`.
//
// The service clamps a requested limit to 200 while the route compared the row
// count against the unclamped request, so `?limit=201` returned a *full* page
// of 200 and `nextCursor: null` — because `200 >= 201` is false. Pagination
// ended silently while older events still existed, which for an audit stream
// means an operator investigating an incident stops seeing history without
// being told. These tests pin the composition of the two functions the route
// uses, at, below, and above the cap.

function events(n: number): AuditEventRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `evt-${String(i).padStart(4, '0')}`,
    actorUserId: 'actor-1',
    action: 'sheet.recycled',
    targetType: 'sheet',
    targetId: 'sheet-1',
    metadataJson: '{}',
    requestId: null,
    createdAt: 1_800_000_000_000 - i,
  }));
}

describe('resolveAuditLimit', () => {
  it('defaults when no limit is supplied', () => {
    expect(resolveAuditLimit(undefined)).toBe(50);
  });

  it('passes through a value within the cap', () => {
    expect(resolveAuditLimit(10)).toBe(10);
  });

  it('clamps at the cap', () => {
    expect(resolveAuditLimit(200)).toBe(200);
    expect(resolveAuditLimit(201)).toBe(200);
    expect(resolveAuditLimit(100_000)).toBe(200);
  });

  it('floors at one and ignores non-finite input', () => {
    expect(resolveAuditLimit(0)).toBe(1);
    expect(resolveAuditLimit(-5)).toBe(1);
    expect(resolveAuditLimit(Number.NaN)).toBe(50);
  });
});

describe('buildAuditPage uses the effective limit for nextCursor', () => {
  it('below the cap: a full page still offers a cursor', () => {
    const limit = resolveAuditLimit(10);
    const page = buildAuditPage(events(10), limit);
    expect(page.events).toHaveLength(10);
    expect(page.nextCursor).toEqual({ createdAt: 1_800_000_000_000 - 9, id: 'evt-0009' });
  });

  it('below the cap: a partial page ends pagination', () => {
    const limit = resolveAuditLimit(10);
    const page = buildAuditPage(events(4), limit);
    expect(page.nextCursor).toBeNull();
  });

  it('at the cap: a full page offers a cursor', () => {
    const limit = resolveAuditLimit(200);
    const page = buildAuditPage(events(200), limit);
    expect(page.events).toHaveLength(200);
    expect(page.nextCursor).not.toBeNull();
  });

  it('above the cap: a full clamped page still offers a cursor', () => {
    // The regression. The service returns 200 rows for a requested 201; the
    // route must recognise that as a full page rather than comparing 200
    // against 201 and reporting the stream exhausted.
    const limit = resolveAuditLimit(201);
    const page = buildAuditPage(events(200), limit);
    expect(page.events).toHaveLength(200);
    expect(page.nextCursor).not.toBeNull();
    expect(page.nextCursor).toEqual({ createdAt: 1_800_000_000_000 - 199, id: 'evt-0199' });
  });

  it('an empty page never offers a cursor', () => {
    expect(buildAuditPage([], resolveAuditLimit(50)).nextCursor).toBeNull();
  });

  it('the page carries no field beyond the audit DTO allowlist', () => {
    const page = buildAuditPage(events(1), resolveAuditLimit(50));
    expect(Object.keys(page.events[0]!).sort()).toEqual([
      'action',
      'actorUserId',
      'createdAt',
      'id',
      'metadata',
      'targetId',
      'targetType',
    ]);
  });
});
