// A minimal fixed-window rate limiter backed by the existing sessions KV
// namespace (Codex M2-QA-04).
//
// `GET /api/v1/auth/start` is reached before authentication exists, so it has
// no session or origin check to lean on, and every request writes a fresh
// OAuth-state record to KV. Without a bound, an anonymous caller can drive
// unlimited KV writes and provider-authorization-URL construction. This is a
// deliberately small application-level control: the approved architecture
// asks for "rate-limit OAuth initiation" now and defers dedicated edge
// DDoS/abuse infrastructure to a V2.1 backlog item, and Durable
// Objects — the natural strongly-consistent building block for a precise
// limiter — are explicitly not-yet-approved infrastructure (technical
// architecture, "Do not select infrastructure for these until the product
// feature is approved"). A fixed-window KV counter needs neither: it is a
// deliberately generous, best-effort bound, not a precise quota.
//
// KV's eventual consistency (also relevant to Codex M2-QA-02) means this
// limiter can under-count across colos for a given window — a determined
// caller distributed across edge locations can exceed the nominal limit.
// That is an accepted, documented gap for a fixed-window KV counter, not a
// silent one: it makes the control meaningfully harder to abuse from a single
// location without claiming precision KV cannot provide.
//
// Fails open on a KV write conflict (Codex M2-RR / M2-QA-04 follow-up): every
// allowed request writes the *same* per-key value, and Cloudflare documents a
// one-write-per-second limit on a single key. Two ordinary legitimate
// requests from one IP within the same second (a double-click, a page with
// its own retry) would otherwise make the second `kv.put` fail, and letting
// that propagate as an uncaught exception would turn the limiter itself into
// a way to break normal sign-in — the opposite of what it exists to prevent.
// A rate limiter's job is to stop abuse, not to become a new failure mode for
// an ordinary caller, so a write failure here is treated as "allow" rather
// than an error.

const KEY_PREFIX = 'ratelimit:';

export interface RateLimitPolicy {
  /** Requests allowed per window, per key. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests counted in the current window, including this one when allowed. */
  count: number;
}

/**
 * Records one attempt for `key` and reports whether it is within `policy`.
 *
 * Fixed-window, not sliding: the count resets at the KV TTL boundary rather
 * than continuously. That is a coarser bound than a sliding window, but needs
 * only a single KV read-modify-write per request rather than a sorted set or
 * external coordinator.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  policy: RateLimitPolicy
): Promise<RateLimitResult> {
  const kvKey = `${KEY_PREFIX}${key}`;
  const raw = await kv.get(kvKey);
  const current = raw === null ? 0 : Number.parseInt(raw, 10);
  const count = Number.isFinite(current) ? current + 1 : 1;

  if (count > policy.limit) {
    return { allowed: false, count: current };
  }

  try {
    await kv.put(kvKey, String(count), { expirationTtl: policy.windowSeconds });
  } catch {
    // See the file header: a same-key write conflict (KV's one-write-per-
    // second limit, hit by two legitimate requests in the same second) must
    // not fail the request it was meant to allow. The count is not durably
    // recorded this time, which only makes the limiter slightly more
    // permissive under contention — never less.
  }
  return { allowed: true, count };
}
