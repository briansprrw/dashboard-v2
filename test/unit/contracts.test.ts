import { describe, expect, it } from 'vitest';

import { toSessionUserDto, toTaskDto } from '../../src/shared/contracts/dto';
import {
  parseGrantMembership,
  parseMoveTask,
  parseProfileBootstrap,
  parseTaskFields,
  parseTransferOwnership,
} from '../../src/shared/contracts/requests';
import { ValidationError } from '../../src/shared/contracts/validation';
import { LIMITS } from '../../src/shared/domain/limits';
import type { TaskRecord, UserRecord } from '../../src/shared/domain/records';

// Runtime validation (AC-D6) and DTO allowlisting (AC-D7).

function taskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sheetId: '22222222-2222-4222-8222-222222222222',
    name: 'Synthetic task',
    status: 'not_started',
    priority: 'medium',
    dueDate: null,
    notes: 'Synthetic note text',
    isPrivate: false,
    notesPrivate: false,
    emojiFlagsJson: null,
    sortKey: 1000,
    createdByUserId: '33333333-3333-4333-8333-333333333333',
    updatedByUserId: '33333333-3333-4333-8333-333333333333',
    createdAt: 1,
    updatedAt: 2,
    closedAt: null,
    recycledAt: null,
    legacySourceId: 'v1-legacy-4321',
    ...overrides,
  };
}

const VALID_TASK_BODY = {
  name: 'A task',
  status: 'not_started',
  priority: 'medium',
  dueDate: null,
  notes: null,
  isPrivate: false,
  notesPrivate: false,
  emojiFlags: [],
};

describe('unknown fields are rejected, not ignored', () => {
  it('rejects an unexpected field on a task write', () => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, sortKey: 5 })).toThrow(ValidationError);
  });

  it('names the offending field', () => {
    try {
      parseTaskFields({ ...VALID_TASK_BODY, createdByUserId: 'x' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationError).fields).toHaveProperty('createdByUserId');
    }
  });

  it('rejects an attempt to set a server-controlled identifier', () => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, id: 'chosen-by-client' })).toThrow(
      ValidationError
    );
  });
});

// M2-FQA-02: a full task replacement (PUT) must state its complete privacy
// intent explicitly. Omission previously defaulted both flags to `false`,
// which would silently declassify an existing private task or note on any
// client payload that forgot — or was written before — either field.
describe('privacy flags are required, not defaulted (M2-FQA-02)', () => {
  function withoutField(field: 'isPrivate' | 'notesPrivate'): Record<string, unknown> {
    const body: Record<string, unknown> = { ...VALID_TASK_BODY };
    delete body[field];
    return body;
  }

  it('rejects a task write that omits isPrivate', () => {
    expect(() => parseTaskFields(withoutField('isPrivate'))).toThrow(ValidationError);
  });

  it('rejects a task write that omits notesPrivate', () => {
    expect(() => parseTaskFields(withoutField('notesPrivate'))).toThrow(ValidationError);
  });

  it('names isPrivate as the offending field when omitted', () => {
    try {
      parseTaskFields(withoutField('isPrivate'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationError).fields).toHaveProperty('isPrivate');
    }
  });

  it('still accepts an explicit isPrivate/notesPrivate of either value', () => {
    expect(parseTaskFields({ ...VALID_TASK_BODY, isPrivate: true }).isPrivate).toBe(true);
    expect(parseTaskFields({ ...VALID_TASK_BODY, notesPrivate: true }).notesPrivate).toBe(true);
  });

  it('rejects an unexpected field on a membership grant', () => {
    expect(() =>
      parseGrantMembership({
        userId: '44444444-4444-4444-8444-444444444444',
        role: 'viewer',
        sheetId: 'elsewhere',
      })
    ).toThrow(ValidationError);
  });

  it('rejects a profile field V2 does not expose', () => {
    // AC-D8: no profile editor, no public username.
    expect(() => parseProfileBootstrap({ locale: 'en-US', displayName: 'New Name' })).toThrow(
      ValidationError
    );
    expect(() => parseProfileBootstrap({ locale: 'en-US', username: 'chosen' })).toThrow(
      ValidationError
    );
  });
});

describe('shape and type validation', () => {
  it.each([[null], [[]], ['a string'], [42]])('rejects a non-object body: %s', (body) => {
    expect(() => parseTaskFields(body)).toThrow(ValidationError);
  });

  it('rejects a missing required field', () => {
    const withoutName: Record<string, unknown> = { ...VALID_TASK_BODY };
    delete withoutName.name;
    expect(() => parseTaskFields(withoutName)).toThrow(ValidationError);
  });

  it('reports every invalid field at once', () => {
    try {
      parseTaskFields({ ...VALID_TASK_BODY, name: 42, status: 'nope', priority: 'urgent-ish' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const fields = (error as ValidationError).fields;
      expect(Object.keys(fields).sort()).toEqual(['name', 'priority', 'status']);
    }
  });
});

describe('enum validation', () => {
  it.each([
    ['status', 'archived'],
    ['priority', 'critical'],
  ])('rejects an invalid %s', (field, value) => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, [field]: value })).toThrow(ValidationError);
  });

  it('accepts every valid status', () => {
    for (const status of [
      'not_started',
      'in_progress',
      'pending',
      'blocked',
      'complete',
      'cancelled',
    ]) {
      expect(parseTaskFields({ ...VALID_TASK_BODY, status }).status).toBe(status);
    }
  });

  it('rejects an invalid membership role', () => {
    expect(() =>
      parseGrantMembership({ userId: '44444444-4444-4444-8444-444444444444', role: 'owner' })
    ).toThrow(ValidationError);
  });
});

describe('date validation', () => {
  it('accepts a valid date', () => {
    expect(parseTaskFields({ ...VALID_TASK_BODY, dueDate: '2026-07-24' }).dueDate).toBe(
      '2026-07-24'
    );
  });

  it.each([
    ['24-07-2026', 'wrong order'],
    ['2026-7-4', 'unpadded'],
    ['2026-07-24T00:00:00Z', 'a datetime'],
    ['not-a-date', 'nonsense'],
  ])('rejects %s (%s)', (value) => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, dueDate: value })).toThrow(ValidationError);
  });

  it('rejects a well-formed but non-existent calendar date', () => {
    // Passes the shape regex and the database GLOB; caught only here.
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, dueDate: '2026-02-30' })).toThrow(
      ValidationError
    );
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseTaskFields({ ...VALID_TASK_BODY, dueDate: '2028-02-29' }).dueDate).toBe(
      '2028-02-29'
    );
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, dueDate: '2026-02-29' })).toThrow(
      ValidationError
    );
  });
});

describe('length bounds match the database constraints', () => {
  it('accepts a name at the maximum length', () => {
    const name = 'x'.repeat(LIMITS.taskName.max);
    expect(parseTaskFields({ ...VALID_TASK_BODY, name }).name).toHaveLength(LIMITS.taskName.max);
  });

  it('rejects a name one character over the maximum', () => {
    const name = 'x'.repeat(LIMITS.taskName.max + 1);
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, name })).toThrow(ValidationError);
  });

  it('rejects an empty name', () => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, name: '' })).toThrow(ValidationError);
  });

  it('rejects notes over the maximum', () => {
    const notes = 'x'.repeat(LIMITS.taskNotes.max + 1);
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, notes })).toThrow(ValidationError);
  });
});

describe('identifier validation', () => {
  it.each([
    ['not-a-uuid'],
    ['11111111-1111-4111-8111'],
    ["1' OR '1'='1"],
    ['../../etc/passwd'],
    [''],
  ])('rejects %s', (value) => {
    expect(() => parseMoveTask({ destinationSheetId: value })).toThrow(ValidationError);
  });

  it('accepts a well-formed UUID', () => {
    const id = '55555555-5555-4555-8555-555555555555';
    expect(parseMoveTask({ destinationSheetId: id }).destinationSheetId).toBe(id);
  });

  it('rejects a non-string identifier', () => {
    expect(() => parseTransferOwnership({ newOwnerUserId: 12345 })).toThrow(ValidationError);
  });
});

describe('emoji flags', () => {
  it('serialises an array of strings', () => {
    expect(parseTaskFields({ ...VALID_TASK_BODY, emojiFlags: ['a', 'b'] }).emojiFlagsJson).toBe(
      '["a","b"]'
    );
  });

  it('rejects a non-array', () => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, emojiFlags: 'a,b' })).toThrow(
      ValidationError
    );
  });

  it('rejects arbitrary nested JSON', () => {
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, emojiFlags: [{ nested: true }] })).toThrow(
      ValidationError
    );
  });

  it('rejects an over-long flag payload', () => {
    const flags = Array.from({ length: 200 }, (_, i) => `flag-${i}`);
    expect(() => parseTaskFields({ ...VALID_TASK_BODY, emojiFlags: flags })).toThrow(
      ValidationError
    );
  });
});

describe('task DTO withholds protected content', () => {
  it('includes notes when the caller may read them', () => {
    const dto = toTaskDto(taskRecord(), true);
    expect(dto.notes).toBe('Synthetic note text');
    expect(dto.notesRedacted).toBe(false);
  });

  it('withholds notes and flags the redaction when the caller may not', () => {
    const dto = toTaskDto(taskRecord({ notesPrivate: true }), false);
    expect(dto.notes).toBeNull();
    expect(dto.notesRedacted).toBe(true);
  });

  it('does not flag a redaction when there was no note to withhold', () => {
    const dto = toTaskDto(taskRecord({ notes: null }), false);
    expect(dto.notes).toBeNull();
    expect(dto.notesRedacted).toBe(false);
  });

  it('never serialises the note text when withheld', () => {
    const marker = 'MARKER-PRIVATE-NOTE-8f2a';
    const dto = toTaskDto(taskRecord({ notes: marker, notesPrivate: true }), false);
    expect(JSON.stringify(dto)).not.toContain(marker);
  });

  it('omits internal and attribution fields entirely', () => {
    const dto = toTaskDto(taskRecord(), true);
    expect(Object.hasOwn(dto, 'legacySourceId')).toBe(false);
    expect(Object.hasOwn(dto, 'createdByUserId')).toBe(false);
    expect(Object.hasOwn(dto, 'updatedByUserId')).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('v1-legacy-4321');
  });

  it('emits exactly the allowlisted keys', () => {
    expect(Object.keys(toTaskDto(taskRecord(), true)).sort()).toEqual(
      [
        'closedAt',
        'createdAt',
        'dueDate',
        'emojiFlags',
        'id',
        'isPrivate',
        'name',
        'notes',
        'notesPrivate',
        'notesRedacted',
        'priority',
        'recycledAt',
        'sheetId',
        'sortKey',
        'status',
        'updatedAt',
      ].sort()
    );
  });
});

describe('session user DTO', () => {
  const user: UserRecord = {
    id: '66666666-6666-4666-8666-666666666666',
    displayName: 'Synthetic Person',
    avatarUrl: null,
    globalRole: 'user',
    state: 'active',
    authVersion: 7,
    locale: 'en-US',
    timezone: 'America/Chicago',
    recycledAt: null,
    createdAt: 1,
    updatedAt: 2,
    lastSeenAt: 3,
  };

  it('omits the auth version', () => {
    const dto = toSessionUserDto(user);
    expect(Object.hasOwn(dto, 'authVersion')).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('7');
  });

  it('emits exactly the allowlisted keys', () => {
    expect(Object.keys(toSessionUserDto(user)).sort()).toEqual(
      ['avatarUrl', 'displayName', 'globalRole', 'id', 'locale', 'timezone'].sort()
    );
  });
});

describe('profile bootstrap is the only profile mutation', () => {
  it('accepts locale and timezone', () => {
    expect(parseProfileBootstrap({ locale: 'en-GB', timezone: 'Europe/London' })).toEqual({
      locale: 'en-GB',
      timezone: 'Europe/London',
    });
  });

  it('rejects an over-long timezone', () => {
    expect(() => parseProfileBootstrap({ timezone: 'x'.repeat(LIMITS.timezone.max + 1) })).toThrow(
      ValidationError
    );
  });
});
