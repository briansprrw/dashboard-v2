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
  'sheet.membership.role_changed',
  'sheet.membership.revoked',
  'sheet.ownership.transferred',
  'sheet.recycled',
  'sheet.restored',
  'sheet.purged',
  'sheet.purged.admin',
  'task.restored.admin',
  'task.purged.admin',
  'user.role.changed',
  'user.disabled',
  'user.recycled',
  'user.restored',
  'user.purged',
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

/**
 * Same as `buildAuditStatement`, for a batch whose mutation is itself guarded
 * by the List's current owner (M4-AR-01).
 *
 * An owner-guarded batch has two possible outcomes, and only one of them is a
 * real action. When the guard no longer matches, every guarded statement
 * affects zero rows, the batch still commits, and the caller raises `409
 * OWNERSHIP_CHANGED`. The audit row must share that fate: batching an
 * unguarded `buildAuditStatement` alongside a guarded mutation records
 * evidence of an action the same batch declined to perform.
 */
export function buildAuditStatementIfSheetOwner(
  deps: ServiceDeps,
  input: WriteAuditInput,
  sheetId: string,
  expectedOwnerUserId: string
): D1PreparedStatement {
  return deps.repos.auditEvents.prepareAppendIfSheetOwner(
    buildAuditRecord(deps, input),
    sheetId,
    expectedOwnerUserId
  );
}

/**
 * As `buildAuditStatementIfSheetOwner`, plus the target account still being
 * active (Codex M4-RR2-01). Used by ownership transfer, whose authorization
 * rests on two facts read before the batch, not one.
 */
export function buildAuditStatementIfSheetOwnerAndActiveUser(
  deps: ServiceDeps,
  input: WriteAuditInput,
  sheetId: string,
  expectedOwnerUserId: string,
  activeUserId: string
): D1PreparedStatement {
  return deps.repos.auditEvents.prepareAppendIfSheetOwnerAndActiveUser(
    buildAuditRecord(deps, input),
    sheetId,
    expectedOwnerUserId,
    activeUserId
  );
}

/**
 * As `buildAuditStatementIfSheetOwner`, plus the membership still existing
 * (Codex M4-RR2-03), so a revocation is only recorded when one really occurs.
 * Must be batched ahead of the `DELETE` it documents.
 */
export function buildAuditStatementIfSheetOwnerAndMembership(
  deps: ServiceDeps,
  input: WriteAuditInput,
  sheetId: string,
  expectedOwnerUserId: string,
  memberUserId: string
): D1PreparedStatement {
  return deps.repos.auditEvents.prepareAppendIfSheetOwnerAndMembership(
    buildAuditRecord(deps, input),
    sheetId,
    expectedOwnerUserId,
    memberUserId
  );
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
