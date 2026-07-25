// Google implementation of the identity-provider seam.
//
// UNVERIFIED AGAINST THE LIVE PROVIDER. M2-R4 records that no Google OAuth
// client and no isolated staging callback exist yet, so this adapter's real
// round-trip has not been exercised. Its structure (endpoints, parameters,
// claim names) follows Google's published OpenID Connect contract, and its
// error handling is tested with synthetic responses — but "the exchange works
// against Google" is not a claim this milestone can make. See the M2 handoff.
//
// The ID token is verified by calling Google's tokeninfo endpoint rather than
// by validating the JWT signature locally against JWKS. That is the weaker of
// the two options and is chosen deliberately for now: a local verifier needs
// key fetching, caching, rotation handling, and clock-skew policy, all of which
// are worth building against a real client rather than guessing. The tokeninfo
// call is correct but adds a network round-trip; replacing it with local JWKS
// verification is recorded as follow-up work, not left implicit.

import type {
  AuthorizationUrlInput,
  ExchangeInput,
  IdentityProviderClient,
  ProviderProfile,
} from './identity-provider';
import { ProviderExchangeError } from './identity-provider';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

/** Minimum scope for sign-in: identity and email, nothing else. */
const SCOPES = ['openid', 'email', 'profile'].join(' ');

interface TokenResponse {
  id_token?: string;
}

interface TokenInfoResponse {
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string | number;
}

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
}

export class GoogleIdentityProvider implements IdentityProviderClient {
  constructor(private readonly config: GoogleProviderConfig) {}

  buildAuthorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // V2 needs no offline access: the provider is used to establish identity at
    // sign-in and never called again on the user's behalf, so no refresh token
    // is requested and none is stored.
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCode(input: ExchangeInput): Promise<ProviderProfile> {
    const idToken = await this.requestIdToken(input);
    const claims = await this.verifyIdToken(idToken);

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new ProviderExchangeError('invalid_token');
    }
    if (typeof claims.email !== 'string' || claims.email.length === 0) {
      throw new ProviderExchangeError('invalid_token');
    }

    // Google reports this as the string "true" through tokeninfo and as a
    // boolean in a decoded JWT; both are accepted, anything else is not.
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    if (!emailVerified) {
      throw new ProviderExchangeError('unverified_email');
    }

    return {
      provider: 'google',
      subject: claims.sub,
      email: claims.email,
      emailVerified: true,
      displayName: typeof claims.name === 'string' && claims.name.length > 0 ? claims.name : null,
      avatarUrl:
        typeof claims.picture === 'string' && claims.picture.length > 0 ? claims.picture : null,
    };
  }

  private async requestIdToken(input: ExchangeInput): Promise<string> {
    const body = new URLSearchParams({
      code: input.code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // The provider's error body is deliberately not read or logged: it echoes
    // request parameters, including the authorization code.
    if (!response.ok) throw new ProviderExchangeError('exchange_failed');

    const payload = (await response.json()) as TokenResponse;
    if (typeof payload.id_token !== 'string' || payload.id_token.length === 0) {
      throw new ProviderExchangeError('exchange_failed');
    }
    return payload.id_token;
  }

  private async verifyIdToken(idToken: string): Promise<TokenInfoResponse> {
    const url = new URL(TOKENINFO_ENDPOINT);
    url.searchParams.set('id_token', idToken);

    const response = await fetch(url.toString());
    if (!response.ok) throw new ProviderExchangeError('invalid_token');

    const claims = (await response.json()) as TokenInfoResponse;

    // The audience check is the one that matters: without it, an ID token
    // issued for *any* Google client would be accepted here.
    if (claims.aud !== this.config.clientId) throw new ProviderExchangeError('invalid_token');

    return claims;
  }
}
