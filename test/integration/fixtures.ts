import { env } from 'cloudflare:test';

import { AuditEventRepository } from '../../src/server/repositories/audit-event-repository';
import { MembershipRepository } from '../../src/server/repositories/membership-repository';
import { PreferencesRepository } from '../../src/server/repositories/preferences-repository';
import { SheetRepository } from '../../src/server/repositories/sheet-repository';
import { TaskEventRepository } from '../../src/server/repositories/task-event-repository';
import { TaskRepository } from '../../src/server/repositories/task-repository';
import { UserRepository } from '../../src/server/repositories/user-repository';
import type { GlobalRole, UserState } from '../../src/shared/domain/enums';
import type { SheetRecord, TaskRecord, UserRecord } from '../../src/shared/domain/records';

// Synthetic fixtures for the integration suite. Every value is invented
// (M0-D21): no real account, email address, List name, or task content appears
// here, and no fixture value is printed into shareable evidence.
//
// Identifiers and emails are randomised per call so tests never collide with one
// another regardless of whether the pool rolls storage back between tests.

export const db = (): D1Database => env.DASH2_DB;

export const users = (): UserRepository => new UserRepository(db());
export const sheets = (): SheetRepository => new SheetRepository(db());
export const memberships = (): MembershipRepository => new MembershipRepository(db());
export const tasks = (): TaskRepository => new TaskRepository(db());
export const taskEvents = (): TaskEventRepository => new TaskEventRepository(db());
export const auditEvents = (): AuditEventRepository => new AuditEventRepository(db());
export const preferences = (): PreferencesRepository => new PreferencesRepository(db());

/** A fixed instant, so timestamp assertions do not depend on wall-clock time. */
export const T0 = 1_800_000_000_000;

export async function makeUser(
  options: { globalRole?: GlobalRole; state?: UserState; now?: number } = {}
): Promise<UserRecord> {
  const id = crypto.randomUUID();
  const now = options.now ?? T0;
  const user = await users().create({
    id,
    displayName: 'Test Person',
    avatarUrl: null,
    globalRole: options.globalRole ?? 'user',
    state: options.state ?? 'active',
    locale: 'en-US',
    timezone: 'America/Chicago',
    now,
  });
  await users().createIdentity({
    provider: 'google',
    providerSubject: crypto.randomUUID(),
    userId: id,
    emailNormalized: `${id}@example.invalid`,
    emailDisplay: `${id}@example.invalid`,
    now,
  });
  return user;
}

export async function makeSheet(
  ownerUserId: string,
  options: { displayName?: string; now?: number } = {}
): Promise<SheetRecord> {
  return sheets().create({
    id: crypto.randomUUID(),
    ownerUserId,
    displayName: options.displayName ?? 'Sample List',
    legacySourceId: null,
    now: options.now ?? T0,
  });
}

export async function makeTask(
  sheetId: string,
  options: Partial<Omit<Parameters<TaskRepository['create']>[0], 'sheetId'>> = {}
): Promise<TaskRecord> {
  return tasks().create({
    id: options.id ?? crypto.randomUUID(),
    sheetId,
    name: options.name ?? 'Sample task',
    status: options.status ?? 'not_started',
    priority: options.priority ?? 'medium',
    dueDate: options.dueDate ?? null,
    notes: options.notes ?? null,
    isPrivate: options.isPrivate ?? false,
    notesPrivate: options.notesPrivate ?? false,
    emojiFlagsJson: options.emojiFlagsJson ?? null,
    sortKey: options.sortKey ?? 1000,
    createdByUserId: options.createdByUserId ?? null,
    legacySourceId: options.legacySourceId ?? null,
    now: options.now ?? T0,
  });
}
