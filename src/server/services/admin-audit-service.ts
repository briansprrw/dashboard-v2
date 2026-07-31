// The administrative/security audit read surface (M4.4, M0 §5's "separate
// event stream"). Every event this returns was already written through
// `buildAuditStatement`/`writeAuditEvent`, whose allowlisted-metadata
// contract (audit.ts) is what keeps this surface free of task names, notes,
// or other private content — this service adds no filtering of its own
// because none is needed: there is nothing sensitive in the stream to filter.

import type { AuditCursor } from '../repositories/audit-event-repository';
import type { AuditEventRecord } from '../../shared/domain/records';
import { AppError } from '../errors/app-error';
import type { Actor } from '../policy';
import { canReadAdminAudit, denyForbidden } from '../policy';
import type { AuditTargetType } from './audit';
import type { ServiceDeps } from './service-context';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class AdminAuditService {
  constructor(private readonly deps: ServiceDeps) {}

  private requireAdmin(actor: Actor): void {
    if (!canReadAdminAudit(actor)) throw denyForbidden();
  }

  private clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, Math.round(limit)));
  }

  /** M4-QA-08: pages beyond the first `limit` rows via a `(createdAt, id)` cursor rather than an offset. */
  async listRecent(
    actor: Actor,
    limit?: number,
    before?: AuditCursor
  ): Promise<AuditEventRecord[]> {
    this.requireAdmin(actor);
    return this.deps.repos.auditEvents.listRecent(this.clampLimit(limit), before);
  }

  async listForTarget(
    actor: Actor,
    targetType: AuditTargetType,
    targetId: string,
    limit?: number,
    before?: AuditCursor
  ): Promise<AuditEventRecord[]> {
    this.requireAdmin(actor);
    if (targetId.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A target id is required.');
    }
    return this.deps.repos.auditEvents.listForTarget(
      targetType,
      targetId,
      this.clampLimit(limit),
      before
    );
  }
}
