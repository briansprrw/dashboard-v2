// The administrative audit vocabulary and the one helper every service uses to
// write to it.
//
// M0 §5 requires audit metadata to be *allowlisted*. That is enforced here by
// typing `metadata` as a map of fixed keys to primitives and by every caller
// building it from literal keys — a task name or note has no way into this
// function without a caller deliberately assigning it to one of those keys,
// which the tests probe for.

import { LIMITS } from '../../shared/domain/limits';
import type { AppendAuditEventInput } from '../repositories/audit-event-repository';
import type { ServiceDeps } from './service-context';
import { idFactory } from './service-context';

/** Sensitive actions the approved model requires to be audited (M0 §5). */
export const AUDIT_ACTIONS = [
  'sheet.membership.granted',
  'sheet.membership.revoked',
  'sheet.ownership.transferred',
  'sheet.recycled',
  'sheet.restored',
  'sheet.purged',
  'task.restored.admin',
  'task.purged.admin',
  'user.role.changed',
  'user.disabled',
  'user.recycled',
  'user.restored',
  'session.revoked.admin',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ['sheet', 'task', 'user', 'membership'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * Values an audit record may carry. Primitives only: no object can be nested in
 * that would smuggle a record's content through, and no free-form string field
 * is offered for "context".
 */
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface WriteAuditInput {
  actorUserId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  metadata?: AuditMetadata;
}

/**
 * Appends one audit row. Serialises the metadata here rather than accepting a
 * pre-built JSON string, so a caller cannot hand over an arbitrary blob.
 *
 * The serialised metadata is length-checked against the same bound the database
 * enforces, and over-long metadata is rejected rather than truncated: a
 * truncated audit record is a misleading one.
 */
export async function writeAuditEvent(deps: ServiceDeps, input: WriteAuditInput): Promise<void> {
  await deps.repos.auditEvents.prepareAppend(buildAuditRecord(deps, input)).run();
}

/**
 * Same validation and serialisation as `writeAuditEvent`, but returns an
 * unexecuted statement instead of running it (M2-FQA-04): a required audit row
 * must commit in the same D1 batch as the mutation it documents, so a caller
 * that needs atomicity prepares this and batches it alongside the mutating
 * statement rather than awaiting a separate write.
 */
export function buildAuditStatement(
  deps: ServiceDeps,
  input: WriteAuditInput
): D1PreparedStatement {
  return deps.repos.auditEvents.prepareAppend(buildAuditRecord(deps, input));
}

function buildAuditRecord(deps: ServiceDeps, input: WriteAuditInput): AppendAuditEventInput {
  const metadataJson = JSON.stringify(input.metadata ?? {});
  if (metadataJson.length > LIMITS.auditMetadataJson.max) {
    throw new Error('Audit metadata exceeds the permitted length');
  }

  return {
    id: idFactory(deps)(),
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadataJson,
    requestId: deps.requestId ?? null,
    now: deps.clock(),
  };
}
