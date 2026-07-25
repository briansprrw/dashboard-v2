// Session cookie policy.
//
// Attributes and why each is what it is (AC-D2):
//
//   HttpOnly           — script must never read the session token, so an XSS
//                        bug cannot exfiltrate a usable credential.
//   SameSite=Lax       — the cookie is not sent on cross-site POSTs, which
//                        removes the classic CSRF vector while still allowing
//                        the top-level GET redirect back from Google to carry
//                        the session. `Strict` would break that return
//                        navigation; `None` would reintroduce CSRF exposure.
//   Path=/             — the API and the SPA share an origin.
//   Secure             — env-driven, as the contract requires: on everywhere
//                        except plain-HTTP localhost, where setting it would
//                        stop the cookie working in local development.
//   Max-Age            — matches the sliding session window.
//
// Cookie serialisation is written out here rather than taken from a helper so
// the exact attribute string is visible and testable in one place.

/** Name is prefixed to make its scope obvious in a browser inspector. */
export const SESSION_COOKIE_NAME = 'dash2_session';

export interface CookiePolicy {
  /** False only for plain-HTTP local development. */
  secure: boolean;
}

export function buildSessionCookie(
  token: string,
  maxAgeSeconds: number,
  policy: CookiePolicy
): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (policy.secure) attributes.push('Secure');
  return attributes.join('; ');
}

/**
 * The cookie that clears the session. `Max-Age=0` plus an empty value, with the
 * same Path/SameSite/Secure attributes — a browser only replaces a cookie when
 * those match, so a mismatch here would leave the old cookie in place.
 */
export function buildSessionClearCookie(policy: CookiePolicy): string {
  const attributes = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (policy.secure) attributes.push('Secure');
  return attributes.join('; ');
}

/**
 * Extracts the session token from a Cookie header.
 *
 * Written by hand rather than with a split-on-`;`-and-`=` one-liner because a
 * cookie *value* may legitimately contain `=` (base64url padding does not, but
 * a future value might), and because a malformed header must yield null rather
 * than a partial match.
 */
export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) !== SESSION_COOKIE_NAME) continue;

    const value = trimmed.slice(separator + 1);
    return value.length > 0 ? value : null;
  }
  return null;
}
