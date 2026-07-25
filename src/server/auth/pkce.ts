// PKCE (RFC 7636) S256 challenge generation.
//
// Included even though the authorization-code flow here uses a confidential
// client with a stored secret: PKCE additionally binds the code to the specific
// sign-in attempt, so an intercepted code cannot be redeemed without the
// verifier that never left the server. The verifier lives in the KV state
// record, so it is server-held for the whole flow.

import { base64UrlEncode, generateToken } from './tokens';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export async function createPkcePair(): Promise<PkcePair> {
  // 43–128 characters of unreserved ASCII is the RFC's requirement; a
  // base64url-encoded 32-byte token satisfies it.
  const verifier = generateToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)), method: 'S256' };
}
