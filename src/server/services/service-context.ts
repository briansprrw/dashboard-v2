// Shared plumbing for the service layer.
//
// Services take their repositories and their clock as constructor arguments
// rather than reaching for globals. That keeps them testable without a network
// or a real wall clock, and — more importantly here — means a service can never
// quietly acquire a capability (a second database, a KV namespace) that its
// declared dependencies do not show.

import type { AuditEventRepository } from '../repositories/audit-event-repository';
import type { MembershipRepository } from '../repositories/membership-repository';
import type { SheetRepository } from '../repositories/sheet-repository';
import type { TaskEventRepository } from '../repositories/task-event-repository';
import type { TaskRepository } from '../repositories/task-repository';
import type { UserRepository } from '../repositories/user-repository';

/** Injected so tests can pin time and so `now` is one value across a request. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

export interface Repositories {
  users: UserRepository;
  sheets: SheetRepository;
  memberships: MembershipRepository;
  tasks: TaskRepository;
  taskEvents: TaskEventRepository;
  auditEvents: AuditEventRepository;
}

export interface ServiceDeps {
  repos: Repositories;
  clock: Clock;
  /** Correlates audit rows with the request that caused them. */
  requestId?: string;
  /** Injected for tests; defaults to real UUIDs. */
  newId?: () => string;
}

export function idFactory(deps: ServiceDeps): () => string {
  return deps.newId ?? (() => crypto.randomUUID());
}
