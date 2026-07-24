// `Error.name` (and `.message`) are ordinary mutable properties — any thrown
// value can set `err.name = '<anything, including private content>'`, so
// neither is ever safe to log directly (Codex independent QA, 2026-07-24:
// reproduced a private-content marker written to `err.name` surviving into
// logs when the coarse category was read straight off the thrown error).
// This allowlist only ever emits one of these fixed literal strings — never
// the caller's actual `.name` value — so a match reveals nothing the
// allowlist didn't already know, and anything unrecognized (including a
// mutated/spoofed name) falls back to the generic category.
const KNOWN_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
]);

export function coarseErrorCategory(err: unknown): string {
  if (!(err instanceof Error)) return 'UnexpectedError';
  // Read `.name` exactly once into a local snapshot before checking it. A
  // hostile Error subclass could define `name` as a getter that returns a
  // different value on each access (Codex Re-review, 2026-07-24: reproduced
  // a getter returning a known-safe name on the membership check and private
  // content on a second, separate read). Reading once and branching on the
  // snapshot closes that gap regardless of what the getter does on any
  // later access.
  const name: unknown = err.name;
  return typeof name === 'string' && KNOWN_ERROR_NAMES.has(name) ? name : 'UnexpectedError';
}
