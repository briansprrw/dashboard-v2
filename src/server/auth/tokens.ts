// Token generation and comparison for authentication material.
//
// Two rules apply to everything in this file:
//
//   1. Entropy comes from `crypto.getRandomValues`, never `Math.random`.
//   2. A secret is never stored in the form it is presented in. Session tokens
//      and OAuth state values are stored as SHA-256 hashes, so a KV dump does
//      not yield usable credentials.
//
// Base64url encoding is used rather than hex to keep cookie and URL values
// compact while staying safe in both contexts without escaping.

/** 32 bytes = 256 bits. Comfortably beyond guessing for a session token. */
const TOKEN_BYTES = 32;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A new high-entropy, URL- and cookie-safe opaque token. */
export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * SHA-256 of a token, base64url-encoded — the form written to KV.
 *
 * The token is a high-entropy random value rather than a user-chosen secret, so
 * a plain hash is appropriate here: there is no dictionary to attack and no
 * benefit to a slow KDF.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}
