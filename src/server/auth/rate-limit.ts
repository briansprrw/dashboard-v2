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
  /**
   * What to do when the counter write itself fails (Codex M4-RR-03).
   *
   * KV permits roughly one write per second to a single key and rejects the
   * rest. Because every allowed request rewrites the same key, a *burst* is
   * exactly the traffic shape that trips that limit — so `'allow'` makes the
   * limiter fail open precisely when it is most needed: the attacker reads the
   * last durable count, their writes all fail, and they continue well past the
   * nominal bound.
   *
   * `'deny'` closes that hole by treating an unrecordable attempt as a refused
   * one. The cost is that a legitimate caller who genuinely issues two
   * requests inside the same second may see one `429`.
   *
   * Which cost is acceptable depends on the route, so this is explicit per
   * policy rather than a global default:
   *
   *   - `'allow'` for `/auth/start`, where M2-QA-04's original reasoning still
   *     holds — a spurious rejection there breaks sign-in itself, and the
   *     endpoint's real protection is that it is bounded per IP and cheap.
   *   - `'deny'` for `/users/lookup`, where a spurious rejection costs a
   *     retry on a lookup box and the control exists specifically to stop
   *     fast bulk enumeration of account existence.
   */
  onWriteFailure: 'allow' | 'deny';
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
    // The attempt could not be durably recorded (KV's one-write-per-second
    // limit on a single key). `policy.onWriteFailure` decides what that means
    // — see the field's own documentation for why it is a per-route choice
    // rather than one global answer. For a `'deny'` policy this is the branch
    // that actually closes the burst hole Codex M4-RR-03 identified: without
    // it, the failure mode and the attack have the same shape.
    if (policy.onWriteFailure === 'deny') {
      return { allowed: false, count: current };
    }
  }
  return { allowed: true, count };
}
