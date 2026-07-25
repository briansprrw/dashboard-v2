import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AuthService,
  AuthenticationFailure,
  normalizeEmail,
  sanitizeRedirectPath,
} from '../../src/server/auth/auth-service';
import type {
  AuthorizationUrlInput,
  ExchangeInput,
  IdentityProviderClient,
  ProviderProfile,
} from '../../src/server/auth/identity-provider';
import { ProviderExchangeError } from '../../src/server/auth/identity-provider';
import { OAuthStateStore } from '../../src/server/auth/oauth-state';
import {
  SessionStore,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_SLIDING_TTL_MS,
} from '../../src/server/auth/session';
import { UserRepository } from '../../src/server/repositories/user-repository';
import { makeUser, T0, users } from './fixtures';

// OAuth and session lifecycle against a REAL Miniflare KV namespace and a real
// D1 database — expiry, one-time consumption, and revocation are exercised
// against the actual storage rather than a stub.
//
// The identity provider itself is a fake implementing the same seam the Google
// adapter implements. That boundary is where M2-R4 bites: no Google OAuth
// client exists yet, so the live round-trip is untested. Everything on this
// side of the seam — state, eligibility, sessions, revocation — is real.

const kv = (): KVNamespace => env.DASH2_SESSIONS;

class FakeProvider implements IdentityProviderClient {
  lastAuthorizationUrl: AuthorizationUrlInput | null = null;
  lastExchange: ExchangeInput | null = null;
  exchangeCount = 0;

  constructor(
    private readonly profile: ProviderProfile | (() => ProviderProfile),
    private readonly failure?: ProviderExchangeError
  ) {}

  buildAuthorizationUrl(input: AuthorizationUrlInput): string {
    this.lastAuthorizationUrl = input;
    return `https://provider.invalid/auth?state=${input.state}`;
  }

  async exchangeCode(input: ExchangeInput): Promise<ProviderProfile> {
    this.exchangeCount += 1;
    this.lastExchange = input;
    if (this.failure) throw this.failure;
    return typeof this.profile === 'function' ? this.profile() : this.profile;
  }
}

function profileFor(email: string, subject: string): ProviderProfile {
  return {
    provider: 'google',
    subject,
    email,
    emailVerified: true,
    displayName: 'Synthetic Person',
    avatarUrl: null,
  };
}

/** A clock the test advances explicitly, so expiry is deterministic. */
function fixedClock(start: number) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function buildAuth(provider: IdentityProviderClient, clock: () => number): AuthService {
  return new AuthService({
    users: new UserRepository(env.DASH2_DB),
    sessions: new SessionStore(kv()),
    states: new OAuthStateStore(kv()),
    provider,
    redirectUri: 'https://dash2.invalid/api/v1/auth/callback',
    clock,
  });
}

describe('OAuth state', () => {
  let store: OAuthStateStore;

  beforeEach(() => {
    store = new OAuthStateStore(kv());
  });

  it('issues a high-entropy state value', async () => {
    const { state } = await store.create({
      codeVerifier: 'verifier',
      redirectPath: '/',
      now: T0,
    });
    // 32 random bytes, base64url-encoded, unpadded.
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('issues a different state each time', async () => {
    const first = await store.create({ codeVerifier: 'a', redirectPath: '/', now: T0 });
    const second = await store.create({ codeVerifier: 'b', redirectPath: '/', now: T0 });
    expect(first.state).not.toBe(second.state);
  });

  it('does not store the state value in plaintext', async () => {
    const { state } = await store.create({
      codeVerifier: 'verifier',
      redirectPath: '/',
      now: T0,
    });
    const listing = await kv().list({ prefix: 'oauth_state:' });
    expect(listing.keys.length).toBeGreaterThan(0);
    // The KV key is a hash; the raw state must not appear in any key name.
    for (const key of listing.keys) {
      expect(key.name).not.toContain(state);
    }
  });

  it('consumes a valid state once and returns the server-held context', async () => {
    const { state } = await store.create({
      codeVerifier: 'the-verifier',
      redirectPath: '/lists',
      now: T0,
    });

    const record = await store.consume(state, T0 + 1000);
    expect(record).not.toBeNull();
    expect(record?.codeVerifier).toBe('the-verifier');
    expect(record?.redirectPath).toBe('/lists');
  });

  it('refuses a replayed state', async () => {
    const { state } = await store.create({ codeVerifier: 'v', redirectPath: '/', now: T0 });

    expect(await store.consume(state, T0 + 1000)).not.toBeNull();
    // The replay is the security-relevant assertion.
    expect(await store.consume(state, T0 + 1000)).toBeNull();
  });

  it('refuses an expired state', async () => {
    const { state } = await store.create({ codeVerifier: 'v', redirectPath: '/', now: T0 });
    // Past the 10-minute TTL.
    expect(await store.consume(state, T0 + 601_000)).toBeNull();
  });

  it('spends an expired state even though it is refused', async () => {
    const { state } = await store.create({ codeVerifier: 'v', redirectPath: '/', now: T0 });
    await store.consume(state, T0 + 601_000);

    // Already deleted, so a later in-window attempt cannot succeed either.
    expect(await store.consume(state, T0 + 1000)).toBeNull();
  });

  it('refuses a state that was never issued', async () => {
    expect(await store.consume('not-a-real-state-value', T0)).toBeNull();
  });

  it('refuses an empty state', async () => {
    expect(await store.consume('', T0)).toBeNull();
  });
});

describe('sanitizeRedirectPath', () => {
  it('keeps a same-origin path', () => {
    expect(sanitizeRedirectPath('/lists/abc')).toBe('/lists/abc');
  });

  it.each([
    { case: 'an absolute URL', candidate: 'https://evil.invalid/path' },
    { case: 'a protocol-relative URL', candidate: '//evil.invalid/path' },
    { case: 'a backslash-escaped path', candidate: '/\\evil.invalid' },
    { case: 'a javascript URL', candidate: 'javascript:alert(1)' },
    { case: 'an empty value', candidate: '' },
    { case: 'null', candidate: null },
  ])('rejects $case', ({ candidate }) => {
    expect(sanitizeRedirectPath(candidate)).toBe('/');
  });
});

describe('sessions', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(kv());
  });

  it('creates a readable session with sliding and absolute expiry', async () => {
    const { token, record } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });

    expect(record.expiresAt).toBe(T0 + SESSION_SLIDING_TTL_MS);
    expect(record.absoluteExpiresAt).toBe(T0 + SESSION_ABSOLUTE_TTL_MS);
    expect(await store.read(token, T0 + 1000)).not.toBeNull();
  });

  it('does not store the token in plaintext', async () => {
    const { token } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });
    const listing = await kv().list({ prefix: 'session:' });
    for (const key of listing.keys) {
      expect(key.name).not.toContain(token);
    }
  });

  it('refuses a session past its sliding expiry', async () => {
    const { token } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });
    expect(await store.read(token, T0 + SESSION_SLIDING_TTL_MS + 1)).toBeNull();
  });

  it('refuses an unknown token', async () => {
    expect(await store.read('not-a-session', T0)).toBeNull();
  });

  it('destroys a session on logout', async () => {
    const { token } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });
    await store.destroy(token);
    expect(await store.read(token, T0 + 1000)).toBeNull();
  });

  it('slides the expiry forward once past the refresh threshold', async () => {
    const { token, record } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });

    const later = T0 + SESSION_SLIDING_TTL_MS * 0.5;
    const { record: refreshed, refreshed: didRefresh } = await store.refresh(token, record, later);

    expect(didRefresh).toBe(true);
    expect(refreshed.expiresAt).toBe(later + SESSION_SLIDING_TTL_MS);
  });

  it('does not rewrite KV for a session used again immediately', async () => {
    const { token, record } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });
    const { refreshed } = await store.refresh(token, record, T0 + 1000);
    expect(refreshed).toBe(false);
  });

  it('never slides past the absolute ceiling', async () => {
    const { token, record } = await store.create({ userId: 'u1', authVersion: 1, now: T0 });

    // Close enough to the absolute expiry that a full sliding window would
    // overshoot it.
    const nearCeiling = T0 + SESSION_ABSOLUTE_TTL_MS - 1000;
    const { record: refreshed } = await store.refresh(token, record, nearCeiling);

    expect(refreshed.expiresAt).toBe(record.absoluteExpiresAt);
    expect(refreshed.expiresAt).toBeLessThan(nearCeiling + SESSION_SLIDING_TTL_MS);
  });
});

describe('sign-in eligibility', () => {
  it('signs in a migrated user whose identity matches by provider subject', async () => {
    const user = await makeUser();
    const identity = await users().findIdentityByProviderSubject('google', '');
    expect(identity).toBeNull(); // sanity: fixture subject is a random UUID

    const existing = await new UserRepository(env.DASH2_DB).findById(user.id);
    expect(existing).not.toBeNull();

    // Look up the fixture's generated subject to sign in with it.
    const byEmail = await users().findIdentityByEmail(`${user.id}@example.invalid`);
    expect(byEmail).not.toBeNull();

    const clock = fixedClock(T0);
    const provider = new FakeProvider(
      profileFor(`${user.id}@example.invalid`, byEmail!.providerSubject)
    );
    const auth = buildAuth(provider, clock.now);

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/lists',
      now: T0,
    });

    const result = await auth.completeSignIn({ code: 'auth-code', state });
    expect(result.user.id).toBe(user.id);
    expect(result.redirectPath).toBe('/lists');
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('refuses an unknown account rather than creating one (no onboarding in V2)', async () => {
    const clock = fixedClock(T0);
    const provider = new FakeProvider(
      profileFor('nobody-here@example.invalid', crypto.randomUUID())
    );
    const auth = buildAuth(provider, clock.now);

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/',
      now: T0,
    });

    await expect(auth.completeSignIn({ code: 'c', state })).rejects.toMatchObject({
      reason: 'no_account',
    });

    // The critical half of the assertion: nothing was created.
    expect(await users().findIdentityByEmail('nobody-here@example.invalid')).toBeNull();
  });

  it.each([['disabled'], ['recycled']] as const)(
    'refuses sign-in for a %s account',
    async (state) => {
      // Created active, then transitioned through the repository: the schema's
      // paired-state CHECK requires `recycled_at` to be set exactly when the
      // state is `recycled`, so a direct insert of that state would be invalid.
      const user = await makeUser();
      if (state === 'disabled') await users().disable(user.id, T0);
      else await users().recycle(user.id, T0);

      const identity = await users().findIdentityByEmail(`${user.id}@example.invalid`);

      const clock = fixedClock(T0);
      const auth = buildAuth(
        new FakeProvider(profileFor(`${user.id}@example.invalid`, identity!.providerSubject)),
        clock.now
      );

      const { state: oauthState } = await new OAuthStateStore(kv()).create({
        codeVerifier: 'v',
        redirectPath: '/',
        now: T0,
      });

      await expect(auth.completeSignIn({ code: 'c', state: oauthState })).rejects.toMatchObject({
        reason: 'account_ineligible',
      });
    }
  );

  it('refuses a replayed callback without calling the provider', async () => {
    const user = await makeUser();
    const identity = await users().findIdentityByEmail(`${user.id}@example.invalid`);

    const clock = fixedClock(T0);
    const provider = new FakeProvider(
      profileFor(`${user.id}@example.invalid`, identity!.providerSubject)
    );
    const auth = buildAuth(provider, clock.now);

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/',
      now: T0,
    });

    await auth.completeSignIn({ code: 'code-1', state });
    expect(provider.exchangeCount).toBe(1);

    await expect(auth.completeSignIn({ code: 'code-1', state })).rejects.toBeInstanceOf(
      AuthenticationFailure
    );

    // State is consumed before the exchange, so the replay costs no provider call.
    expect(provider.exchangeCount).toBe(1);
  });

  it('maps a provider failure to a generic authentication failure', async () => {
    const clock = fixedClock(T0);
    const auth = buildAuth(
      new FakeProvider(
        profileFor('x@example.invalid', 'sub'),
        new ProviderExchangeError('exchange_failed')
      ),
      clock.now
    );

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/',
      now: T0,
    });

    await expect(auth.completeSignIn({ code: 'c', state })).rejects.toMatchObject({
      reason: 'exchange_failed',
    });
  });

  it('refuses an unverified provider email', async () => {
    const clock = fixedClock(T0);
    const auth = buildAuth(
      new FakeProvider(
        profileFor('x@example.invalid', 'sub'),
        new ProviderExchangeError('unverified_email')
      ),
      clock.now
    );

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/',
      now: T0,
    });

    await expect(auth.completeSignIn({ code: 'c', state })).rejects.toMatchObject({
      reason: 'unverified_email',
    });
  });
});

describe('session resolution and immediate revocation', () => {
  async function signedInUser() {
    const user = await makeUser();
    const identity = await users().findIdentityByEmail(`${user.id}@example.invalid`);
    const clock = fixedClock(T0);
    const auth = buildAuth(
      new FakeProvider(profileFor(`${user.id}@example.invalid`, identity!.providerSubject)),
      clock.now
    );

    const { state } = await new OAuthStateStore(kv()).create({
      codeVerifier: 'v',
      redirectPath: '/',
      now: T0,
    });
    const result = await auth.completeSignIn({ code: 'c', state });
    return { user, auth, token: result.sessionToken, clock };
  }

  it('resolves a live session to its user', async () => {
    const { user, auth, token } = await signedInUser();
    const resolved = await auth.resolveSession(token);
    expect(resolved?.user.id).toBe(user.id);
  });

  it('rejects the session immediately after an auth-version bump', async () => {
    const { user, auth, token } = await signedInUser();
    expect(await auth.resolveSession(token)).not.toBeNull();

    await users().bumpAuthVersion(user.id, T0 + 1);

    // No clock advance: revocation must not wait for cookie expiry.
    expect(await auth.resolveSession(token)).toBeNull();
  });

  it.each([['disabled'], ['recycled']] as const)(
    'rejects the session immediately when the account becomes %s',
    async (state) => {
      const { user, auth, token } = await signedInUser();
      expect(await auth.resolveSession(token)).not.toBeNull();

      if (state === 'disabled') await users().disable(user.id, T0 + 1);
      else await users().recycle(user.id, T0 + 1);

      expect(await auth.resolveSession(token)).toBeNull();
    }
  );

  it('destroys the KV record when a session is rejected, not just refuses it', async () => {
    const { user, auth, token } = await signedInUser();
    await users().bumpAuthVersion(user.id, T0 + 1);

    await auth.resolveSession(token);

    // Restoring the auth version must not resurrect the session.
    expect(await new SessionStore(kv()).read(token, T0 + 2)).toBeNull();
  });

  it('rejects a session whose user row has been deleted', async () => {
    const { user, auth, token } = await signedInUser();
    // No owned Lists, so the RESTRICT foreign key permits the delete.
    await users().deletePermanently(user.id);
    expect(await auth.resolveSession(token)).toBeNull();
  });

  it('rejects a token after sign-out', async () => {
    const { auth, token } = await signedInUser();
    await auth.signOut(token);
    expect(await auth.resolveSession(token)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const { auth, token } = await signedInUser();
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(await auth.resolveSession(tampered)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Person@Example.Invalid ')).toBe('person@example.invalid');
  });

  it('does not strip dots or plus tags, which would collide distinct addresses', () => {
    expect(normalizeEmail('a.b+tag@example.invalid')).toBe('a.b+tag@example.invalid');
  });
});
