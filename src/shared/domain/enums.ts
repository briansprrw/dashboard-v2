// Canonical stored values for every fixed domain enum. These strings are the
// exact values persisted in D1 (see the CHECK constraints in
// migrations/0002_domain_schema.sql) — display labels and icons are a
// presentation concern and never leak back into storage.
//
// Each list is declared `as const` and paired with a type guard so runtime
// validation (M2.4) and repository row mapping share one source of truth
// instead of drifting apart.

/** Task status (product plan B6). */
export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'pending',
  'blocked',
  'complete',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Statuses that close a task. `closed_at` is set exactly when the status is one
 * of these, enforced by a CHECK constraint as well as here, because closed-task
 * retention and "hide N days after closing" both depend on the agreement.
 */
export const CLOSED_TASK_STATUSES = [
  'complete',
  'cancelled',
] as const satisfies readonly TaskStatus[];
export type ClosedTaskStatus = (typeof CLOSED_TASK_STATUSES)[number];

/** Task priority (product plan B7). */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Shareable List roles. Owner is deliberately absent: ownership is canonical on
 * `sheets.owner_user_id` (M0-D12) and is never represented as a membership row.
 * New shares default to `viewer` (M0-D3); the default is applied by the service
 * layer so every write states the role explicitly.
 */
export const MEMBERSHIP_ROLES = ['viewer', 'editor'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Effective rights a user has on one List, as resolved by policy. This is the
 * membership role plus the two authorities that do not live in the memberships
 * table: `owner` (canonical on the sheet) and `none`.
 */
export const SHEET_ACCESS_LEVELS = ['none', 'viewer', 'editor', 'owner'] as const;
export type SheetAccessLevel = (typeof SHEET_ACCESS_LEVELS)[number];

/**
 * Account state. `disabled` and `recycled` are distinct conditions and
 * `disabled` is never overloaded to mean "in the recycle bin" (M0-D22).
 * Neither may authenticate or use memberships.
 */
export const USER_STATES = ['active', 'disabled', 'recycled'] as const;
export type UserState = (typeof USER_STATES)[number];

/** Global (site-wide) role. Admin authority never grants protected-content reads (M0-D16). */
export const GLOBAL_ROLES = ['user', 'admin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** List state. Lists have no `disabled` condition — only active or recycled. */
export const SHEET_STATES = ['active', 'recycled'] as const;
export type SheetState = (typeof SHEET_STATES)[number];

/** Identity providers. V2 launches with Google only; more are V2.1 (M0-D7). */
export const IDENTITY_PROVIDERS = ['google'] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

/**
 * Task-history event vocabulary written by V2. Unlike the enums above this is
 * not backed by a CHECK constraint: no approved decision fixes the history
 * vocabulary, so constraining storage now would either box in M4's history work
 * or force a follow-up migration. Validate against this list at the service
 * boundary instead.
 */
export const TASK_EVENT_TYPES = ['created', 'updated', 'moved', 'recycled', 'restored'] as const;
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export const isTaskStatus = (value: unknown): value is TaskStatus => includes(TASK_STATUSES, value);
export const isTaskPriority = (value: unknown): value is TaskPriority =>
  includes(TASK_PRIORITIES, value);
export const isMembershipRole = (value: unknown): value is MembershipRole =>
  includes(MEMBERSHIP_ROLES, value);
export const isUserState = (value: unknown): value is UserState => includes(USER_STATES, value);
export const isGlobalRole = (value: unknown): value is GlobalRole => includes(GLOBAL_ROLES, value);
export const isSheetState = (value: unknown): value is SheetState => includes(SHEET_STATES, value);
export const isIdentityProvider = (value: unknown): value is IdentityProvider =>
  includes(IDENTITY_PROVIDERS, value);
export const isTaskEventType = (value: unknown): value is TaskEventType =>
  includes(TASK_EVENT_TYPES, value);

/** True when the status closes the task, and therefore requires a `closedAt`. */
export function isClosedStatus(status: TaskStatus): status is ClosedTaskStatus {
  return (CLOSED_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

/**
 * A user in this state cannot authenticate and cannot exercise any membership,
 * regardless of an existing session (Launch Contract §2).
 */
export function isAuthEligibleState(state: UserState): boolean {
  return state === 'active';
}
