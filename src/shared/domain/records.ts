// Internal domain records: the typed shapes repositories return in place of raw
// D1 rows. They are camelCase, use `null` (never `undefined`) for absent
// nullable columns, and represent instants as epoch milliseconds.
//
// These are NOT response DTOs. A domain record may legitimately carry protected
// content (a task's notes, a history entry's before/after values); deciding what
// a given caller may see is the policy layer's job (M2.2) and shaping the wire
// response is the DTO layer's job (M2.4). Nothing here may be serialised
// straight to a client.
//
// Where a caller must not receive protected content at all — an administrative
// recovery or audit path — this module declares a *separate, narrower record*
// (`TaskRecoveryRecord`, `TaskEventMetadataRecord`) that the repository
// populates with a query which never selects the protected columns. That is
// deliberate: allowlist the projection at the SQL boundary rather than
// serialising a full record and subtracting fields afterwards.

import type {
  GlobalRole,
  IdentityProvider,
  MembershipRole,
  SheetState,
  TaskPriority,
  TaskStatus,
  UserState,
} from './enums';

export interface UserRecord {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  state: UserState;
  /** Bumping this invalidates every existing session for the user immediately. */
  authVersion: number;
  locale: string | null;
  timezone: string | null;
  recycledAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number | null;
}

export interface UserIdentityRecord {
  provider: IdentityProvider;
  providerSubject: string;
  userId: string;
  emailNormalized: string;
  emailDisplay: string;
  createdAt: number;
  updatedAt: number;
}

export interface SheetRecord {
  id: string;
  ownerUserId: string;
  displayName: string;
  state: SheetState;
  legacySourceId: string | null;
  createdAt: number;
  updatedAt: number;
  recycledAt: number | null;
}

/**
 * A List the actor can reach, with the access level that granted the reach.
 * `accessLevel` is `owner` when the actor owns the List, otherwise their
 * membership role — resolved in SQL so callers never re-derive it.
 */
export interface AccessibleSheetRecord extends SheetRecord {
  accessLevel: 'owner' | MembershipRole;
}

export interface SheetMembershipRecord {
  sheetId: string;
  userId: string;
  role: MembershipRole;
  createdAt: number;
  createdByUserId: string | null;
}

export interface TaskRecord {
  id: string;
  sheetId: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** `YYYY-MM-DD`, or null for undated (TBD) work. */
  dueDate: string | null;
  notes: string | null;
  /** Visible only to the List owner — not to editors, viewers, or Admin. */
  isPrivate: boolean;
  /** Withholds `notes` from everyone but the List owner; the task stays visible. */
  notesPrivate: boolean;
  emojiFlagsJson: string | null;
  sortKey: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Set exactly when `status` is a closed status. */
  closedAt: number | null;
  /** Set exactly when the task is in the recycle bin. */
  recycledAt: number | null;
  legacySourceId: string | null;
}

/**
 * The only task shape an administrative recovery or purge path may load. It
 * carries enough to identify the object and its recycle state and nothing that
 * reveals what the task is about: no name, no notes, no privacy flags, no
 * history. Populated by a query that does not select those columns at all.
 */
export interface TaskRecoveryRecord {
  id: string;
  sheetId: string;
  recycledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * The only List shape an administrative recovery or purge path may load: opaque
 * identity, ownership, and lifecycle state, without the List's display name.
 */
export interface SheetRecoveryRecord {
  id: string;
  ownerUserId: string;
  state: SheetState;
  recycledAt: number | null;
}

export interface TaskEventRecord {
  id: string;
  taskId: string;
  actorUserId: string | null;
  eventType: string;
  /** Full before/after values including names and notes — List-owner-only. */
  changesJson: string;
  createdAt: number;
}

/**
 * Allowlisted task-history metadata: that a change of some type happened, by
 * whom, and when. `changesJson` is absent by construction, not filtered out.
 */
export interface TaskEventMetadataRecord {
  id: string;
  taskId: string;
  actorUserId: string | null;
  eventType: string;
  createdAt: number;
}

export interface UserPreferencesRecord {
  userId: string;
  preferencesJson: string;
  schemaVersion: number;
  updatedAt: number;
}

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  /** Allowlisted metadata only — never task content, credentials, or session IDs. */
  metadataJson: string;
  requestId: string | null;
  createdAt: number;
}
