// Response DTOs: the wire shapes, and the only functions permitted to build
// them.
//
// The governing rule (CLAUDE.md, and M0 §6 for the future public case) is that
// a response is *constructed from an allowlist*, never a domain record with
// fields deleted afterwards. Every builder below therefore names each field it
// emits explicitly. A column added to a table in a later migration cannot
// appear in a response by default — someone has to add it here.
//
// `toTaskDto` is the one that carries the privacy decision. It takes the
// policy's answers as arguments rather than computing them, so the caller must
// have consulted policy to call it at all, and a test can prove the mapping
// independently of how the decision was reached.

import type {
  AccessibleSheetRecord,
  AuditEventRecord,
  SheetMembershipRecord,
  SheetRecord,
  SheetRecoveryRecord,
  TaskEventMetadataRecord,
  TaskEventRecord,
  TaskRecord,
  UserRecord,
} from '../domain/records';
import type {
  GlobalRole,
  MembershipRole,
  SheetState,
  TaskPriority,
  TaskStatus,
} from '../domain/enums';

export interface TaskDto {
  id: string;
  sheetId: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  /** Null when withheld; `notesRedacted` distinguishes that from a genuinely empty note. */
  notes: string | null;
  /** True when a note exists but this caller may not read it. */
  notesRedacted: boolean;
  isPrivate: boolean;
  notesPrivate: boolean;
  emojiFlags: string[];
  sortKey: number;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  recycledAt: number | null;
}

/**
 * Builds a task response.
 *
 * `canReadNotes` must come from `canReadTaskNotes`. When it is false the note
 * is replaced with null and `notesRedacted` is set — the client can render
 * "this note is private" without ever receiving the text.
 *
 * `legacySourceId`, `createdByUserId`, and `updatedByUserId` are deliberately
 * absent: they are internal or attribution fields with no launch UI, and
 * omitting them here means no future serialisation change can leak them.
 */
export function toTaskDto(task: TaskRecord, canReadNotes: boolean): TaskDto {
  const hasNote = task.notes !== null && task.notes.length > 0;
  return {
    id: task.id,
    sheetId: task.sheetId,
    name: task.name,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    notes: canReadNotes ? task.notes : null,
    notesRedacted: !canReadNotes && hasNote,
    isPrivate: task.isPrivate,
    notesPrivate: task.notesPrivate,
    emojiFlags: parseEmojiFlags(task.emojiFlagsJson),
    sortKey: task.sortKey,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    closedAt: task.closedAt,
    recycledAt: task.recycledAt,
  };
}

/**
 * Stored JSON that should be an object. A malformed value yields `{}` rather
 * than throwing: a corrupt history or audit row must not make an entire
 * response fail, and the empty object is an honest "nothing readable here".
 */
function parseJsonObject(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function parseEmojiFlags(json: string | null): string[] {
  if (json === null) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export interface SheetDto {
  id: string;
  displayName: string;
  ownerUserId: string;
  state: SheetState;
  createdAt: number;
  updatedAt: number;
  recycledAt: number | null;
}

/** `legacySourceId` is omitted: a migration-only field with no client meaning. */
export function toSheetDto(sheet: SheetRecord): SheetDto {
  return {
    id: sheet.id,
    displayName: sheet.displayName,
    ownerUserId: sheet.ownerUserId,
    state: sheet.state,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    recycledAt: sheet.recycledAt,
  };
}

export interface AccessibleSheetDto extends SheetDto {
  accessLevel: 'owner' | MembershipRole;
}

export function toAccessibleSheetDto(sheet: AccessibleSheetRecord): AccessibleSheetDto {
  return { ...toSheetDto(sheet), accessLevel: sheet.accessLevel };
}

export interface MembershipDto {
  sheetId: string;
  userId: string;
  role: MembershipRole;
  createdAt: number;
}

export function toMembershipDto(membership: SheetMembershipRecord): MembershipDto {
  return {
    sheetId: membership.sheetId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt,
  };
}

/**
 * The signed-in user's own profile.
 *
 * `authVersion` is absent on purpose — it is a revocation mechanism, and
 * exposing its value tells a client nothing useful while revealing how many
 * times the account has been revoked. Email is absent too: V2 has no profile
 * screen (M0-D20) and nothing in the launch UI needs it.
 */
export interface SessionUserDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  locale: string | null;
  timezone: string | null;
}

export function toSessionUserDto(user: UserRecord): SessionUserDto {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
    locale: user.locale,
    timezone: user.timezone,
  };
}

export interface TaskEventDto {
  id: string;
  taskId: string;
  actorUserId: string | null;
  eventType: string;
  createdAt: number;
  /** Full before/after values. Present only on the List owner's history read. */
  changes: unknown;
}

/** Owner-only: includes the protected before/after values. */
export function toTaskEventDto(event: TaskEventRecord): TaskEventDto {
  const changes = parseJsonObject(event.changesJson);
  return {
    id: event.id,
    taskId: event.taskId,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    createdAt: event.createdAt,
    changes,
  };
}

/**
 * Administrative history metadata. A structurally *different* type from
 * `TaskEventDto` — not the same type with a field omitted — so a handler
 * cannot return one where the other is expected.
 */
export interface TaskEventMetadataDto {
  id: string;
  taskId: string;
  actorUserId: string | null;
  eventType: string;
  createdAt: number;
}

export function toTaskEventMetadataDto(event: TaskEventMetadataRecord): TaskEventMetadataDto {
  return {
    id: event.id,
    taskId: event.taskId,
    actorUserId: event.actorUserId,
    eventType: event.eventType,
    createdAt: event.createdAt,
  };
}

/**
 * The administrative recovery view of a task.
 *
 * Contains identity, location, lifecycle timestamps, and a history count. It
 * cannot contain content: the record it is built from was produced by a query
 * that never selected any. Note there is no `name`, no `notes`, and no
 * `isPrivate` — whether a task is private is itself information about it.
 */
export interface TaskRecoveryDto {
  id: string;
  sheetId: string;
  recycledAt: number | null;
  createdAt: number;
  updatedAt: number;
  historyEventCount: number;
}

export function toTaskRecoveryDto(input: {
  task: {
    id: string;
    sheetId: string;
    recycledAt: number | null;
    createdAt: number;
    updatedAt: number;
  };
  historyEventCount: number;
}): TaskRecoveryDto {
  return {
    id: input.task.id,
    sheetId: input.task.sheetId,
    recycledAt: input.task.recycledAt,
    createdAt: input.task.createdAt,
    updatedAt: input.task.updatedAt,
    historyEventCount: input.historyEventCount,
  };
}

/** Administrative recovery view of a List: no `displayName`. */
export interface SheetRecoveryDto {
  id: string;
  ownerUserId: string;
  state: SheetState;
  recycledAt: number | null;
}

export function toSheetRecoveryDto(sheet: SheetRecoveryRecord): SheetRecoveryDto {
  return {
    id: sheet.id,
    ownerUserId: sheet.ownerUserId,
    state: sheet.state,
    recycledAt: sheet.recycledAt,
  };
}

export interface AuditEventDto {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: number;
}

/** `requestId` is omitted: an internal correlation value, not client data. */
export function toAuditEventDto(event: AuditEventRecord): AuditEventDto {
  const metadata = parseJsonObject(event.metadataJson);
  return {
    id: event.id,
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata,
    createdAt: event.createdAt,
  };
}
