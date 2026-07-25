// The identity-provider seam.
//
// Everything that requires a real Google OAuth client — an authorization URL
// against the live endpoint, a code-for-token exchange, an ID-token
// verification — is confined to this interface and its Google implementation.
// The rest of the authentication code (state handling, eligibility, sessions,
// cookies, revocation) depends only on the interface and is therefore fully
// testable without any external resource.
//
// That boundary is deliberate and load-bearing for this milestone: M2-R4
// records that no Google OAuth client and no staging environment exist yet, so
// the live round-trip cannot be exercised. Isolating it here means exactly one
// adapter is unverified rather than the whole authentication path.

import type { IdentityProvider } from '../../shared/domain/enums';

/** The provider-supplied facts a sign-in yields. No tokens are propagated. */
export interface ProviderProfile {
  provider: IdentityProvider;
  /** Stable provider-side account identifier (`sub`). Never an email. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthorizationUrlInput {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface ExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Implementations must never return, log, or throw provider access tokens,
 * refresh tokens, ID tokens, or authorization codes. `exchangeCode` returns a
 * profile only — the tokens are consumed inside the adapter and discarded,
 * because V2 needs no ongoing provider access after sign-in.
 */
export interface IdentityProviderClient {
  buildAuthorizationUrl(input: AuthorizationUrlInput): string;
  exchangeCode(input: ExchangeInput): Promise<ProviderProfile>;
}

/** Raised for any provider-side failure. Carries no provider payload. */
export class ProviderExchangeError extends Error {
  constructor(readonly reason: 'exchange_failed' | 'invalid_token' | 'unverified_email') {
    // A fixed literal: the provider's own error text is never propagated,
    // since it can contain the submitted code or other request detail.
    super('Identity provider exchange failed');
    this.name = 'ProviderExchangeError';
  }
}
