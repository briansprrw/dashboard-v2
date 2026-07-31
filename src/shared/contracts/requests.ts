// Request shapes and their validators.
//
// Each parser declares its allowlist of fields, rejects anything else, and
// returns a fully-typed value. A handler that has a parsed result in hand knows
// every field is present, correctly typed, and within bounds — there is no
// second validation step in the route.

import { MEMBERSHIP_ROLES, TASK_PRIORITIES, TASK_STATUSES } from '../domain/enums';
import type { MembershipRole, TaskPriority, TaskStatus } from '../domain/enums';
import { LIMITS } from '../domain/limits';
import {
  fitsSheetPreferencesSizeLimit,
  sanitizeSheetPreferences,
  type SheetPreferences,
} from '../domain/sheet-preferences';
import {
  FieldErrors,
  rejectUnknownFields,
  requireObject,
  validateBoolean,
  validateDueDate,
  validateEmojiFlags,
  validateEnum,
  validateId,
  validateOptionalString,
  validateString,
  ValidationError,
} from './validation';

export interface CreateSheetRequest {
  displayName: string;
}

const CREATE_SHEET_FIELDS = ['displayName'] as const;

export function parseCreateSheet(input: unknown): CreateSheetRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, CREATE_SHEET_FIELDS);

  const errors = new FieldErrors();
  const displayName = validateString(errors, 'displayName', body.displayName, LIMITS.sheetName);
  errors.throwIfAny();

  return { displayName: displayName as string };
}

export type RenameSheetRequest = CreateSheetRequest;
export const parseRenameSheet = parseCreateSheet;

export interface LookupUserByEmailRequest {
  email: string;
}

const LOOKUP_USER_BY_EMAIL_FIELDS = ['email'] as const;

/**
 * The sharing/ownership-transfer entry point: an owner names a collaborator by
 * their exact email (M4-D2 — no directory or partial search exists; V2 has no
 * username yet, M0 §2). Bounds match `LIMITS.email`, the same bound the
 * identity row itself is stored under, so a value that passes here cannot
 * fail to find a real row purely on length.
 */
export function parseLookupUserByEmail(input: unknown): LookupUserByEmailRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, LOOKUP_USER_BY_EMAIL_FIELDS);

  const errors = new FieldErrors();
  const email = validateString(errors, 'email', body.email, LIMITS.email);
  errors.throwIfAny();

  return { email: email as string };
}

export interface GrantMembershipRequest {
  userId: string;
  role: MembershipRole;
}

const GRANT_MEMBERSHIP_FIELDS = ['userId', 'role'] as const;

/**
 * `role` has no default here even though new shares default to Viewer (M0-D3).
 * The default is applied by the caller that knows it is creating a *new* share;
 * silently defaulting an omitted role on every request would turn a malformed
 * "make this user an editor" into a successful viewer grant.
 */
export function parseGrantMembership(input: unknown): GrantMembershipRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, GRANT_MEMBERSHIP_FIELDS);

  const errors = new FieldErrors();
  const userId = validateId(errors, 'userId', body.userId);
  const role = validateEnum(errors, 'role', body.role, MEMBERSHIP_ROLES);
  errors.throwIfAny();

  return { userId: userId as string, role: role as MembershipRole };
}

export interface TransferOwnershipRequest {
  newOwnerUserId: string;
}

const TRANSFER_OWNERSHIP_FIELDS = ['newOwnerUserId'] as const;

export function parseTransferOwnership(input: unknown): TransferOwnershipRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, TRANSFER_OWNERSHIP_FIELDS);

  const errors = new FieldErrors();
  const newOwnerUserId = validateId(errors, 'newOwnerUserId', body.newOwnerUserId);
  errors.throwIfAny();

  return { newOwnerUserId: newOwnerUserId as string };
}

const SHEET_PREFERENCES_FIELDS = ['sheetOrder', 'hiddenSheetIds'] as const;
// Matches the per-field cap in `sheet-preferences.ts` (M4-QA-05) — kept in
// sync there rather than imported, since the domain module intentionally has
// no dependency on the request-validation layer.
const MAX_SHEET_PREFERENCE_IDS = 100;

function parseIdArray(errors: FieldErrors, field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    errors.add(field, 'Expected an array of identifiers.');
    return [];
  }
  if (value.length > MAX_SHEET_PREFERENCE_IDS) {
    errors.add(field, `Must contain at most ${MAX_SHEET_PREFERENCE_IDS} identifiers.`);
    return [];
  }
  const ids: string[] = [];
  value.forEach((entry, index) => {
    const id = validateId(errors, `${field}[${index}]`, entry);
    if (id !== null) ids.push(id);
  });
  return ids;
}

/**
 * The one server-backed preference V2 launches with (M4.3, M4-D3): a user's
 * own sheet order and hidden-sheet set. Every id is validated as a real
 * identifier here — stricter than `sanitizeSheetPreferences`, which is the
 * lenient recovery path for a stored document that predates a shape change,
 * not the boundary a client request should be allowed to slip malformed
 * ids through.
 */
export function parseSheetPreferences(input: unknown): SheetPreferences {
  const body = requireObject(input);
  rejectUnknownFields(body, SHEET_PREFERENCES_FIELDS);

  const errors = new FieldErrors();
  const sheetOrder = parseIdArray(errors, 'sheetOrder', body.sheetOrder ?? []);
  const hiddenSheetIds = parseIdArray(errors, 'hiddenSheetIds', body.hiddenSheetIds ?? []);
  errors.throwIfAny();

  const parsed = sanitizeSheetPreferences({ sheetOrder, hiddenSheetIds });
  // The real enforced bound (M4-QA-05): a request under the per-field id
  // count cap can still, combined across both fields, serialize past the
  // database's own `preferences_json` CHECK. Checked after both fields are
  // known, not per-field, since it is their combined size that matters.
  if (!fitsSheetPreferencesSizeLimit(parsed)) {
    throw new ValidationError({
      sheetOrder: 'Combined sheetOrder and hiddenSheetIds are too large to store.',
    });
  }
  return parsed;
}

export interface TaskFieldsRequest {
  name: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  notes: string | null;
  isPrivate: boolean;
  notesPrivate: boolean;
  emojiFlagsJson: string | null;
}

const TASK_FIELDS = [
  'name',
  'status',
  'priority',
  'dueDate',
  'notes',
  'isPrivate',
  'notesPrivate',
  'emojiFlags',
] as const;

/**
 * Full task field state, used by both create and update.
 *
 * The privacy flags are required, with no default (M2-FQA-04): a full
 * replacement (PUT) must state the complete intended state explicitly. An
 * omission-defaults-to-`false` rule sounds safe but is not, because it applies
 * on *update* too — a client that sends every field except `isPrivate` would
 * silently declassify an existing private task rather than leaving it alone.
 * Requiring the field instead of guessing at its absence means a stale or
 * partial client payload fails validation instead of quietly changing a
 * privacy-sensitive flag no one asked to change.
 */
export function parseTaskFields(input: unknown): TaskFieldsRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, TASK_FIELDS);

  const errors = new FieldErrors();
  const name = validateString(errors, 'name', body.name, LIMITS.taskName);
  const status = validateEnum(errors, 'status', body.status, TASK_STATUSES);
  const priority = validateEnum(errors, 'priority', body.priority, TASK_PRIORITIES);
  const dueDate = validateDueDate(errors, 'dueDate', body.dueDate);
  const notes = validateOptionalString(errors, 'notes', body.notes, LIMITS.taskNotes);
  const isPrivate = validateBoolean(errors, 'isPrivate', body.isPrivate);
  const notesPrivate = validateBoolean(errors, 'notesPrivate', body.notesPrivate);
  const emojiFlagsJson = validateEmojiFlags(errors, 'emojiFlags', body.emojiFlags);
  errors.throwIfAny();

  return {
    name: name as string,
    status: status as TaskStatus,
    priority: priority as TaskPriority,
    dueDate,
    notes,
    isPrivate,
    notesPrivate,
    emojiFlagsJson,
  };
}

export interface MoveTaskRequest {
  destinationSheetId: string;
  confirmed: boolean;
}

const MOVE_TASK_FIELDS = ['destinationSheetId', 'confirmed'] as const;

export function parseMoveTask(input: unknown): MoveTaskRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, MOVE_TASK_FIELDS);

  const errors = new FieldErrors();
  const destinationSheetId = validateId(errors, 'destinationSheetId', body.destinationSheetId);
  const confirmed = validateBoolean(errors, 'confirmed', body.confirmed, false);
  errors.throwIfAny();

  return { destinationSheetId: destinationSheetId as string, confirmed };
}

export interface ProfileBootstrapRequest {
  locale: string | null;
  timezone: string | null;
}

const PROFILE_BOOTSTRAP_FIELDS = ['locale', 'timezone'] as const;

/**
 * The *only* profile mutation V2 exposes (AC-D8): browser-derived locale and
 * timezone. Display name and avatar are provider-supplied and deliberately have
 * no request field, so there is no profile-editing surface and no
 * public-username field.
 */
export function parseProfileBootstrap(input: unknown): ProfileBootstrapRequest {
  const body = requireObject(input);
  rejectUnknownFields(body, PROFILE_BOOTSTRAP_FIELDS);

  const errors = new FieldErrors();
  const locale = validateOptionalString(errors, 'locale', body.locale, LIMITS.locale);
  const timezone = validateOptionalString(errors, 'timezone', body.timezone, LIMITS.timezone);
  errors.throwIfAny();

  return { locale, timezone };
}
