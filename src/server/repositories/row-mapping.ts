// Shared row-mapping helpers.
//
// Repositories map D1 rows to domain records by hand rather than casting or
// spreading, for three reasons: SQLite has no boolean or enum type, so 0/1 and
// bare strings must be narrowed deliberately; a hand-written mapper cannot
// accidentally forward a column a later migration adds; and an unexpected
// stored value fails loudly at the boundary instead of flowing into policy
// decisions as an unchecked string.

/**
 * Narrows a stored string to a known enum member. Throws on an unexpected
 * value: a status or role that is not in the approved set means the database
 * disagrees with the application, and guessing would risk an authorization
 * decision made on a value no policy function understands.
 *
 * The offending value is included in the message because these are canonical
 * enum values (`viewer`, `complete`, …), never user content.
 */
export function toEnum<T extends readonly string[]>(
  allowed: T,
  value: unknown,
  column: string
): T[number] {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  throw new Error(`Unexpected stored value in column "${column}": ${String(value)}`);
}

/** SQLite has no boolean type; integer 0/1 columns map to `boolean`. */
export function toBoolean(value: unknown, column: string): boolean {
  if (value === 0 || value === 1) return value === 1;
  throw new Error(`Unexpected stored value in column "${column}": ${String(value)}`);
}

/** `boolean` back to the integer form the 0/1 CHECK constraints accept. */
export function fromBoolean(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

/** Normalises SQLite's absent value to `null` so records never carry `undefined`. */
export function toNullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/**
 * Renders an explicit column list, optionally table-qualified. Every read in
 * every repository is built from a declared list rather than `SELECT *`, so a
 * column added by a later migration cannot silently widen an existing query —
 * which matters most for the reads that deliberately exclude protected content.
 */
export function columnList(names: readonly string[], prefix = ''): string {
  return names.map((name) => `${prefix}${name}`).join(', ');
}
