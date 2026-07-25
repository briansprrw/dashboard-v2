// Runtime request validation.
//
// Hand-written rather than schema-library-driven, matching the repository's
// existing "reviewed SQL and small modules rather than an ORM" posture (M0-D12)
// and adding no dependency for a bounded set of shapes.
//
// Three properties every validator here guarantees, because AC-D6 names them:
//
//   consistent  — every failure produces the same `ValidationError` shape, so
//                 the HTTP layer maps them to one stable 400 envelope.
//   bounded     — every string is length-checked against `LIMITS`, the same
//                 source the database CHECK constraints use.
//   closed      — unknown fields are rejected, not ignored. An ignored unknown
//                 field silently discards a client's intent; worse, on a
//                 sensitive write it can hide an attempt to set something the
//                 caller should not control.

import { LIMITS } from '../domain/limits';

export class ValidationError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

/** Accumulates per-field messages so one response reports every problem. */
export class FieldErrors {
  private readonly errors: Record<string, string> = {};

  add(field: string, message: string): void {
    // First error per field wins: later, more generic messages must not
    // overwrite the specific one that was detected first.
    if (!(field in this.errors)) this.errors[field] = message;
  }

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  throwIfAny(): void {
    if (this.hasErrors) throw new ValidationError({ ...this.errors });
  }
}

/** The parsed body must be a plain object — not null, an array, or a primitive. */
export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError({ body: 'Expected a JSON object.' });
  }
  return value as Record<string, unknown>;
}

/**
 * Rejects any property not in the allowlist.
 *
 * Runs *before* field validation so a request carrying an unexpected field
 * fails for that reason rather than appearing to succeed with it dropped.
 */
export function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: readonly string[]
): void {
  const permitted = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !permitted.has(key));
  if (unknown.length > 0) {
    const fields: Record<string, string> = {};
    for (const key of unknown) fields[key] = 'Unknown field.';
    throw new ValidationError(fields);
  }
}

export interface StringBounds {
  min: number;
  max: number;
}

export function validateString(
  errors: FieldErrors,
  field: string,
  value: unknown,
  bounds: StringBounds
): string | null {
  if (typeof value !== 'string') {
    errors.add(field, 'Expected a string.');
    return null;
  }
  // Length is measured in code units, matching SQLite's `length()` on TEXT so
  // a value that passes here cannot fail the database CHECK.
  if (value.length < bounds.min) {
    errors.add(field, `Must be at least ${bounds.min} character(s).`);
    return null;
  }
  if (value.length > bounds.max) {
    errors.add(field, `Must be at most ${bounds.max} character(s).`);
    return null;
  }
  return value;
}

export function validateOptionalString(
  errors: FieldErrors,
  field: string,
  value: unknown,
  bounds: StringBounds
): string | null {
  if (value === null || value === undefined) return null;
  return validateString(errors, field, value, bounds);
}

export function validateBoolean(
  errors: FieldErrors,
  field: string,
  value: unknown,
  fallback?: boolean
): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') {
    errors.add(field, 'Expected a boolean.');
    return fallback ?? false;
  }
  return value;
}

export function validateEnum<T extends string>(
  errors: FieldErrors,
  field: string,
  value: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    errors.add(field, `Must be one of: ${allowed.join(', ')}.`);
    return null;
  }
  return value as T;
}

/**
 * `YYYY-MM-DD` only, and the date must actually exist.
 *
 * The round-trip check rejects `2026-02-30`, which the shape regex alone
 * accepts and which the database's GLOB constraint would also accept — this is
 * the layer that catches it.
 */
export function validateDueDate(errors: FieldErrors, field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.add(field, 'Expected a date in YYYY-MM-DD format.');
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.add(field, 'Not a valid calendar date.');
    return null;
  }
  return value;
}

/** UUID v4-shaped identifier, matching what the application generates. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateId(errors: FieldErrors, field: string, value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    errors.add(field, 'Expected a valid identifier.');
    return null;
  }
  return value;
}

/** Path-parameter form: throws immediately, since there is nothing to accumulate. */
export function requireId(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError({ [field]: 'Expected a valid identifier.' });
  }
  return value;
}

/**
 * Emoji-flag payload: a JSON array of short strings, length-bounded as stored.
 * Validated as structure rather than passed through, so a client cannot store
 * arbitrary JSON in the column.
 */
export function validateEmojiFlags(
  errors: FieldErrors,
  field: string,
  value: unknown
): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    errors.add(field, 'Expected an array of strings.');
    return null;
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > LIMITS.emojiFlagsJson.max) {
    errors.add(field, 'Too many flags.');
    return null;
  }
  return serialized;
}
