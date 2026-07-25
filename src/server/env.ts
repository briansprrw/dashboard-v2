import type { Actor } from './policy';
import type { SessionRecord } from './auth/session';

export interface Env {
  DASH2_DB: D1Database;
  DASH2_SESSIONS: KVNamespace;
  APP_VERSION: string;

  // --- Authentication configuration (M2.3) ---
  //
  // Secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are Wrangler secrets,
  // set with `wrangler secret put` and never present in wrangler.jsonc, source,
  // logs, or evidence. They are optional in this type because the Worker must
  // still start and serve /health when authentication is not yet configured —
  // the auth routes report a clear 503 instead of the Worker failing to boot.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  /**
   * Absolute callback URL registered with the provider, e.g.
   * `https://dash2-preview.example.workers.dev/api/v1/auth/callback`. A plain
   * var, not a secret.
   */
  OAUTH_REDIRECT_URI?: string;

  /**
   * Set to `"false"` only for plain-HTTP local development. Anything else —
   * including unset — yields `Secure` cookies, so the insecure setting must be
   * chosen deliberately and can never be arrived at by omission (AC-D2's
   * "explicit env-driven Secure").
   */
  COOKIE_SECURE?: string;

  /**
   * Comma-separated origins permitted to make state-changing requests. When
   * unset, the request's own Origin must match its Host.
   */
  ALLOWED_ORIGINS?: string;
}

export interface Variables {
  requestId: string;
  /** Present only on authenticated routes; set by the `authenticate` middleware. */
  actor: Actor;
  session: SessionRecord;
  sessionToken: string;
}

export type AppEnv = { Bindings: Env; Variables: Variables };

/** Cookies are Secure unless explicitly disabled for local HTTP development. */
export function cookieSecureFrom(env: Env): boolean {
  return env.COOKIE_SECURE !== 'false';
}
