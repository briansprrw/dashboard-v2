// Opaque server-side sessions in KV.
//
// The session cookie carries a random token and nothing else — no user id, no
// role, no claims, nothing signed. Everything about the session is server-held,
// so a client cannot alter any of it, and revocation is a server-side fact
// rather than a request to the client to stop using something.
//
// Two expiries apply together (M0 §8, 30-day sliding):
//
//   sliding  — `expiresAt` moves forward as the session is used, so an active
//              user is not signed out mid-use.
//   absolute — `absoluteExpiresAt` never moves, so a session cannot be kept
//              alive indefinitely by continued use. A token stolen from a
//              long-lived session still dies on the original schedule.
//
// The stored key is a hash of the token: a KV dump yields no usable cookie.
//
// "Immediate" revocation (destroy on rejection, below) is best-effort, not a
// strict guarantee, because it runs on Workers KV (Codex M2-QA-02). KV
// documents cross-location write propagation that can take up to 60 seconds,
// so a `destroy` or a revoking write from one location is not instantly
// visible from another. `AuthService.resolveSession`'s D1-backed
// `auth_version` check is the primary revocation mechanism and is strongly
// consistent; KV's role here is opaque storage for the session record itself,
// not the source of the revocation guarantee. Brian reviewed this and
// approved keeping sessions in KV and accepting the residual cross-location
// race as a documented, bounded risk (M2-QA-02-DECISION in the M2 milestone
// document's Decision Log) rather than adding new strongly-consistent
// infrastructure.

import { generateToken, hashToken } from './tokens';

const KEY_PREFIX = 'session:';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 30-day sliding window (M0 §8). */
export const SESSION_SLIDING_TTL_MS = 30 * DAY_MS;

/**
 * Hard ceiling regardless of activity. 90 days is three full sliding windows:
 * long enough never to interrupt an ordinary active user, short enough that a
 * forgotten session does not live forever.
 */
export const SESSION_ABSOLUTE_TTL_MS = 90 * DAY_MS;

/**
 * How much of the sliding window must elapse before a refresh rewrites KV.
 * Without this every request would issue a KV write; at 10% an active session
 * is refreshed at most once every three days.
 */
const REFRESH_THRESHOLD_FRACTION = 0.1;

export interface SessionRecord {
  userId: string;
  /**
   * The `users.auth_version` in force when the session was created. A mismatch
   * against the current value means the session was revoked, which is what
   * makes role changes and account disablement take effect immediately rather
   * than at cookie expiry.
   */
  authVersion: number;
  createdAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
}

export interface CreatedSession {
  /** The value to place in the cookie. Held only for the length of this response. */
  token: string;
  record: SessionRecord;
}

function keyFor(tokenHash: string): string {
  return `${KEY_PREFIX}${tokenHash}`;
}

/** KV TTL for a record, floored at 60s (KV's minimum). */
function ttlSecondsFor(record: SessionRecord, now: number): number {
  const expiry = Math.min(record.expiresAt, record.absoluteExpiresAt);
  return Math.max(60, Math.ceil((expiry - now) / 1000));
}

export class SessionStore {
  constructor(private readonly kv: KVNamespace) {}

  async create(input: {
    userId: string;
    authVersion: number;
    now: number;
  }): Promise<CreatedSession> {
    const token = generateToken();
    const record: SessionRecord = {
      userId: input.userId,
      authVersion: input.authVersion,
      createdAt: input.now,
      expiresAt: input.now + SESSION_SLIDING_TTL_MS,
      absoluteExpiresAt: input.now + SESSION_ABSOLUTE_TTL_MS,
    };

    await this.kv.put(keyFor(await hashToken(token)), JSON.stringify(record), {
      expirationTtl: ttlSecondsFor(record, input.now),
    });

    return { token, record };
  }

  /**
   * Reads a session, treating expired or malformed records as absent.
   *
   * Does *not* check `authVersion` — that requires the current user row and is
   * done by the authentication middleware, which has the database. Keeping the
   * store ignorant of it means there is one place where revocation is checked
   * rather than two that could disagree.
   */
  async read(token: string, now: number): Promise<SessionRecord | null> {
    if (token.length === 0) return null;

    const raw = await this.kv.get(keyFor(await hashToken(token)));
    if (raw === null) return null;

    let record: SessionRecord;
    try {
      record = JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }

    if (typeof record.expiresAt !== 'number' || typeof record.absoluteExpiresAt !== 'number') {
      return null;
    }
    if (record.expiresAt <= now || record.absoluteExpiresAt <= now) return null;

    return record;
  }

  /**
   * Extends the sliding window, never past the absolute ceiling. Returns the
   * record actually in force, and whether it was rewritten, so a caller can
   * decide whether to re-issue the cookie.
   */
  async refresh(
    token: string,
    record: SessionRecord,
    now: number
  ): Promise<{ record: SessionRecord; refreshed: boolean }> {
    const elapsed = now - (record.expiresAt - SESSION_SLIDING_TTL_MS);
    if (elapsed < SESSION_SLIDING_TTL_MS * REFRESH_THRESHOLD_FRACTION) {
      return { record, refreshed: false };
    }

    const extended: SessionRecord = {
      ...record,
      expiresAt: Math.min(now + SESSION_SLIDING_TTL_MS, record.absoluteExpiresAt),
    };

    await this.kv.put(keyFor(await hashToken(token)), JSON.stringify(extended), {
      expirationTtl: ttlSecondsFor(extended, now),
    });

    return { record: extended, refreshed: true };
  }

  /** Destroys one session. Used by logout; idempotent. */
  async destroy(token: string): Promise<void> {
    if (token.length === 0) return;
    await this.kv.delete(keyFor(await hashToken(token)));
  }
}
