// Per-request construction of repositories, services, and the auth stack.
//
// Built fresh per request rather than at module scope: a Worker isolate is
// reused across requests and across *different* environments in local
// development, so caching anything derived from `c.env` risks one request
// seeing another's bindings.

import { AuthService } from './auth/auth-service';
import { GoogleIdentityProvider } from './auth/google-provider';
import type { IdentityProviderClient } from './auth/identity-provider';
import { OAuthStateStore } from './auth/oauth-state';
import { SessionStore } from './auth/session';
import type { Env } from './env';
import { AppError } from './errors/app-error';
import { AuditEventRepository } from './repositories/audit-event-repository';
import { MembershipRepository } from './repositories/membership-repository';
import { SheetRepository } from './repositories/sheet-repository';
import { TaskEventRepository } from './repositories/task-event-repository';
import { TaskRepository } from './repositories/task-repository';
import { UserRepository } from './repositories/user-repository';
import { AccountService } from './services/account-service';
import { AdminRecoveryService } from './services/admin-recovery-service';
import type { Clock, Repositories, ServiceDeps } from './services/service-context';
import { systemClock } from './services/service-context';
import { SheetService } from './services/sheet-service';
import { TaskService } from './services/task-service';

export function buildRepositories(env: Env): Repositories {
  const db = env.DASH2_DB;
  return {
    users: new UserRepository(db),
    sheets: new SheetRepository(db),
    memberships: new MembershipRepository(db),
    tasks: new TaskRepository(db),
    taskEvents: new TaskEventRepository(db),
    auditEvents: new AuditEventRepository(db),
  };
}

export interface AppServices {
  repos: Repositories;
  sheets: SheetService;
  tasks: TaskService;
  accounts: AccountService;
  adminRecovery: AdminRecoveryService;
}

export function buildServices(
  env: Env,
  requestId: string,
  clock: Clock = systemClock
): AppServices {
  const repos = buildRepositories(env);
  const deps: ServiceDeps = { repos, clock, requestId };

  const sheets = new SheetService(deps);
  return {
    repos,
    sheets,
    tasks: new TaskService(deps, sheets),
    accounts: new AccountService(deps),
    adminRecovery: new AdminRecoveryService(deps),
  };
}

/**
 * Builds the authentication stack for *sign-in*, which needs the provider.
 *
 * Throws a 503 when the provider is not configured. That is the honest answer
 * for the current environment: M2-R4 records that no Google OAuth client
 * exists yet, so a deploy without those secrets must fail clearly on the
 * sign-in routes rather than appear to work.
 */
export function buildAuthService(
  env: Env,
  clock: Clock = systemClock,
  providerOverride?: IdentityProviderClient
): AuthService {
  const provider = providerOverride ?? buildProvider(env);
  const redirectUri = env.OAUTH_REDIRECT_URI;

  if (!redirectUri) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not available.', {
      logDetail: { missingConfig: 'OAUTH_REDIRECT_URI' },
    });
  }

  return buildAuthServiceWith(env, provider, redirectUri, clock);
}

/**
 * Builds the authentication stack for *session resolution*, which does not.
 *
 * Validating a session token reads KV and D1 and never contacts the provider,
 * so requiring provider configuration here would turn "your session is
 * invalid" (401) into "the service is broken" (503) on any deployment without
 * OAuth secrets — misreporting an ordinary unauthenticated request as an
 * outage. Session resolution therefore gets a provider stub whose methods
 * throw if they are ever reached, which would be a programming error rather
 * than a configuration one.
 */
export function buildSessionResolver(env: Env, clock: Clock = systemClock): AuthService {
  return buildAuthServiceWith(env, unreachableProvider, '', clock);
}

const unreachableProvider: IdentityProviderClient = {
  buildAuthorizationUrl() {
    throw new Error('Sign-in provider is not available during session resolution');
  },
  async exchangeCode() {
    throw new Error('Sign-in provider is not available during session resolution');
  },
};

function buildAuthServiceWith(
  env: Env,
  provider: IdentityProviderClient,
  redirectUri: string,
  clock: Clock
): AuthService {
  return new AuthService({
    users: new UserRepository(env.DASH2_DB),
    sessions: new SessionStore(env.DASH2_SESSIONS),
    states: new OAuthStateStore(env.DASH2_SESSIONS),
    provider,
    redirectUri,
    clock,
  });
}

function buildProvider(env: Env): IdentityProviderClient {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    // Names only. The values are never read into a message, a log, or an error.
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not available.', {
      logDetail: { missingConfig: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET' },
    });
  }
  return new GoogleIdentityProvider({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
}
