// Synthetic DTO fixtures for the `web` test project — invented values only
// (M0-D21), matching the integration suite's fixture convention.

import type { AccessibleSheetDto, SessionUserDto, TaskDto } from '../../src/shared/contracts/dto';

export function makeSessionUser(overrides: Partial<SessionUserDto> = {}): SessionUserDto {
  return {
    id: 'user-1',
    displayName: 'Test Person',
    avatarUrl: null,
    globalRole: 'user',
    locale: 'en-US',
    timezone: 'America/Chicago',
    ...overrides,
  };
}

export function makeSheet(overrides: Partial<AccessibleSheetDto> = {}): AccessibleSheetDto {
  return {
    id: 'sheet-1',
    displayName: 'Sample List',
    ownerUserId: 'user-1',
    state: 'active',
    accessLevel: 'owner',
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    recycledAt: null,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-1',
    sheetId: 'sheet-1',
    name: 'Sample task',
    status: 'not_started',
    priority: 'medium',
    dueDate: null,
    notes: null,
    notesRedacted: false,
    isPrivate: false,
    notesPrivate: false,
    emojiFlags: [],
    sortKey: 0,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    closedAt: null,
    recycledAt: null,
    ...overrides,
  };
}
