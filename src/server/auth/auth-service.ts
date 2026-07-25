// The sign-in state machine: initiation, callback, session resolution, logout.
//
// The eligibility rule this file enforces is a launch decision, not a technical
// one: "V2 supports only users migrated from V1. V2 does not create new
// accounts through invite codes or other onboarding" (M0 §2). So a successful
// Google authentication for an unknown email is *not* a sign-up — it is a
// denial. `resolveEligibleUser` never creates a user row.
//
// Every user-facing authentication failure is deliberately identical
// (`AuthOutcome.reason` is for server logs only, never the response body). A
// caller must not be able to distinguish "no such account", "account disabled",
// "account recycled", or "email not verified" — each of those answers would
// disclose whether a given email has an account here.

import type { UserRecord } from '../../shared/domain/records';
import { isAuthEligibleState } from '../../shared/domain/enums';
import type { UserRepository } from '../repositories/user-repository';
import type { IdentityProviderClient, ProviderProfile } from './identity-provider';
import { ProviderExchangeError } from './identity-provider';
import { OAuthStateStore } from './oauth-state';
import { createPkcePair } from './pkce';
import type { SessionRecord } from './session';
import { SessionStore } from './session';

/** Why a sign-in failed. Server-log only — never serialised to a client. */
export type AuthFailureReason =
  'invalid_state' | 'exchange_failed' | 'unverified_email' | 'no_account' | 'account_ineligible';

export class AuthenticationFailure extends Error {
  constructor(readonly reason: AuthFailureReason) {
    super('Authentication failed');
    this.name = 'AuthenticationFailure';
  }
}

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionStore;
  states: OAuthStateStore;
  provider: IdentityProviderClient;
  redirectUri: string;
  clock: () => number;
}

export interface SignInStart {
  authorizationUrl: string;
}

export interface SignInResult {
  user: UserRecord;
  sessionToken: string;
  session: SessionRecord;
  redirectPath: string;
}

/**
 * Only same-origin absolute paths are accepted as a post-login destination.
 * Rejects protocol-relative (`//evil.example`) and absolute URLs, which would
 * turn the callback into an open redirect.
 */
export function sanitizeRedirectPath(candidate: string | null | undefined): string {
  if (typeof candidate !== 'string' || candidate.length === 0) return '/';
  if (!candidate.startsWith('/')) return '/';
  if (candidate.startsWith('//')) return '/';
  if (candidate.includes('\\')) return '/';
  return candidate;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /** Builds the provider redirect and stores the server-held flow context. */
  async startSignIn(redirectPath: string | null): Promise<SignInStart> {
    const pkce = await createPkcePair();
    const { state } = await this.deps.states.create({
      codeVerifier: pkce.verifier,
      redirectPath: sanitizeRedirectPath(redirectPath),
      now: this.deps.clock(),
    });

    return {
      authorizationUrl: this.deps.provider.buildAuthorizationUrl({
        state,
        codeChallenge: pkce.challenge,
        redirectUri: this.deps.redirectUri,
      }),
    };
  }

  /**
   * Completes the flow: consumes the state, exchanges the code, resolves the
   * account, and issues a session.
   *
   * Ordering matters. The state is consumed *first*, before the code is used,
   * so a replayed callback is rejected without any provider call at all.
   */
  async completeSignIn(input: { code: string; state: string }): Promise<SignInResult> {
    const now = this.deps.clock();

    const stateRecord = await this.deps.states.consume(input.state, now);
    if (stateRecord === null) throw new AuthenticationFailure('invalid_state');

    let profile: ProviderProfile;
    try {
      profile = await this.deps.provider.exchangeCode({
        code: input.code,
        codeVerifier: stateRecord.codeVerifier,
        redirectUri: this.deps.redirectUri,
      });
    } catch (error) {
      if (error instanceof ProviderExchangeError && error.reason === 'unverified_email') {
        throw new AuthenticationFailure('unverified_email');
      }
      throw new AuthenticationFailure('exchange_failed');
    }

    const user = await this.resolveEligibleUser(profile, now);
    const { token, record } = await this.deps.sessions.create({
      userId: user.id,
      authVersion: user.authVersion,
      now,
    });

    await this.deps.users.touchLastSeen(user.id, now);

    return { user, sessionToken: token, session: record, redirectPath: stateRecord.redirectPath };
  }

  /**
   * Finds the migrated account behind a provider identity and refreshes its
   * profile basics. Never creates an account.
   *
   * The lookup is by provider subject first — the stable identifier — falling
   * back to a normalised email match for an account migrated from V1 that has
   * not yet signed in and therefore has no `provider_subject` binding. When the
   * fallback matches, the identity row is created, binding that subject to the
   * account permanently.
   */
  private async resolveEligibleUser(profile: ProviderProfile, now: number): Promise<UserRecord> {
    const emailNormalized = normalizeEmail(profile.email);

    let user = await this.deps.users.findByProviderIdentity(profile.provider, profile.subject);

    if (user === null) {
      const identity = await this.deps.users.findIdentityByEmail(emailNormalized);
      if (identity === null) throw new AuthenticationFailure('no_account');

      user = await this.deps.users.findById(identity.userId);
      if (user === null) throw new AuthenticationFailure('no_account');

      // Bind this provider subject to the migrated account, but only if the
      // account has none for this provider yet. `createIdentity` would violate
      // the primary key otherwise, which is the correct outcome: two subjects
      // must not map to one account silently.
      if (identity.providerSubject !== profile.subject) {
        const existing = await this.deps.users.findIdentityByProviderSubject(
          profile.provider,
          profile.subject
        );
        if (existing === null) {
          await this.deps.users.createIdentity({
            provider: profile.provider,
            providerSubject: profile.subject,
            userId: user.id,
            emailNormalized,
            emailDisplay: profile.email,
            now,
          });
        }
      }
    }

    if (!isAuthEligibleState(user.state)) {
      throw new AuthenticationFailure('account_ineligible');
    }

    // Profile basics are provider- and browser-sourced only (M0-D20, AC-D8).
    // Locale and timezone are supplied by the browser on a later bootstrap
    // call, so they are preserved rather than cleared here.
    await this.deps.users.updateProfileBasics(user.id, {
      displayName: profile.displayName ?? user.displayName,
      avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      locale: user.locale,
      timezone: user.timezone,
      now,
    });

    const refreshed = await this.deps.users.findById(user.id);
    return refreshed ?? user;
  }

  /**
   * Resolves the user behind a session token, or null.
   *
   * This is where immediate revocation happens, and it is why every
   * authenticated request costs one user read: the session's recorded
   * `authVersion` is compared against the account's current value, and the
   * account's state is rechecked. A disabled, recycled, or role-changed account
   * therefore loses access on its very next request rather than when its cookie
   * expires.
   *
   * A session that fails either check is destroyed, not merely rejected, so a
   * revoked token stops occupying KV.
   */
  async resolveSession(
    token: string
  ): Promise<{ user: UserRecord; session: SessionRecord } | null> {
    const now = this.deps.clock();

    const record = await this.deps.sessions.read(token, now);
    if (record === null) return null;

    const user = await this.deps.users.findById(record.userId);
    if (user === null) {
      await this.deps.sessions.destroy(token);
      return null;
    }

    if (user.authVersion !== record.authVersion) {
      await this.deps.sessions.destroy(token);
      return null;
    }

    if (!isAuthEligibleState(user.state)) {
      await this.deps.sessions.destroy(token);
      return null;
    }

    const { record: current } = await this.deps.sessions.refresh(token, record, now);
    return { user, session: current };
  }

  async signOut(token: string): Promise<void> {
    await this.deps.sessions.destroy(token);
  }
}

/**
 * Case- and whitespace-normalised email for lookup. Deliberately does not strip
 * dots or `+` tags: those are provider-specific rules, and applying Gmail's to
 * every address would let two distinct addresses collide onto one account.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
