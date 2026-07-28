// OAuth state: high-entropy, expiring, one-time, and bound to server-held
// context.
//
// The state parameter defends the callback against CSRF and against replay. All
// four properties below are required by M2's scope line ("Google OAuth with
// high-entropy, expiring, one-time state") and each is implemented so that
// failing to honour it is not possible from the callback path:
//
//   high-entropy — 256 bits from crypto.getRandomValues.
//   expiring     — KV `expirationTtl`, so an abandoned state disappears even if
//                  nothing ever consumes it; the stored record also carries its
//                  own `expiresAt` so expiry does not depend solely on KV's
//                  eventual deletion.
//   one-time     — `consume` deletes before returning. A second call with the
//                  same value gets nothing, whether it is an attacker replaying
//                  or a user double-submitting.
//   server-bound — the PKCE verifier and post-login redirect live in the KV
//                  record, never in the URL, so the client cannot choose them.
//
// The state value itself is stored *hashed*: a KV listing does not yield a
// usable state parameter.
//
// One-time consumption is best-effort, not a strict guarantee, because it is
// built on Workers KV (Codex M2-QA-02). KV documents reads as eventually
// consistent, with cross-location write propagation that can take up to 60
// seconds. Two callbacks racing the same state within that window, from
// different Cloudflare locations, could both read it before either delete
// becomes visible. Brian reviewed this and approved keeping sessions/state in
// KV and accepting this residual race as a documented, bounded risk rather
// than adding new strongly-consistent infrastructure (M2-QA-02-DECISION in
// the M2 milestone document's Decision Log) — this is not a claim that KV
// makes replay impossible, and no further code change is expected here absent
// a new incident or decision.

import { generateToken, hashToken } from './tokens';

/** Ten minutes: long enough for a slow sign-in, short enough to bound replay. */
export const OAUTH_STATE_TTL_SECONDS = 600;

const KEY_PREFIX = 'oauth_state:';

/** Server-held context bound to one sign-in attempt. Never sent to the client. */
export interface OAuthStateRecord {
  /** PKCE code verifier; exchanged with the provider, never exposed. */
  codeVerifier: string;
  /** Same-origin path to return to after sign-in. Validated before storage. */
  redirectPath: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreatedOAuthState {
  /** The opaque value to place in the authorization URL's `state` parameter. */
  state: string;
  record: OAuthStateRecord;
}

function keyFor(stateHash: string): string {
  return `${KEY_PREFIX}${stateHash}`;
}

export class OAuthStateStore {
  constructor(private readonly kv: KVNamespace) {}

  /**
   * Issues a new state value and stores its server-side context under the
   * hash of that value.
   */
  async create(input: {
    codeVerifier: string;
    redirectPath: string;
    now: number;
  }): Promise<CreatedOAuthState> {
    const state = generateToken();
    const record: OAuthStateRecord = {
      codeVerifier: input.codeVerifier,
      redirectPath: input.redirectPath,
      createdAt: input.now,
      expiresAt: input.now + OAUTH_STATE_TTL_SECONDS * 1000,
    };

    await this.kv.put(keyFor(await hashToken(state)), JSON.stringify(record), {
      expirationTtl: OAUTH_STATE_TTL_SECONDS,
    });

    return { state, record };
  }

  /**
   * Retrieves and destroys a state record: get-then-delete, not a single
   * atomic KV primitive (KV has none). See the file header for the
   * consequence of that on Workers KV's eventual consistency (Codex M2-QA-02).
   *
   * Deletes before validating expiry, so even an expired state is spent by the
   * attempt to use it. Returns null for absent, already-consumed, expired, or
   * unparseable records — the caller cannot distinguish these, and must not:
   * each one means "this callback is not trustworthy" and they carry no
   * information a legitimate client needs.
   */
  async consume(state: string, now: number): Promise<OAuthStateRecord | null> {
    if (state.length === 0) return null;

    const key = keyFor(await hashToken(state));
    const raw = await this.kv.get(key);

    // One-time: gone whether or not it turns out to be valid below.
    await this.kv.delete(key);

    if (raw === null) return null;

    let record: OAuthStateRecord;
    try {
      record = JSON.parse(raw) as OAuthStateRecord;
    } catch {
      return null;
    }

    if (typeof record.expiresAt !== 'number' || record.expiresAt <= now) return null;
    return record;
  }
}
