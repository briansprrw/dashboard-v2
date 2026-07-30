import { describe, expect, it } from 'vitest';

import { sortTasksForDisplay } from '../../src/web/components/tasks/task-sort';
import { makeTask } from './fixtures';

describe('sortTasksForDisplay', () => {
  it('places urgent tasks before every other priority', () => {
    const low = makeTask({ id: 'low', priority: 'low', name: 'B' });
    const urgent = makeTask({ id: 'urgent', priority: 'urgent', name: 'A' });
    expect(sortTasksForDisplay([low, urgent]).map((t) => t.id)).toEqual(['urgent', 'low']);
  });

  it('sorts by due date ascending within the same urgency tier', () => {
    const later = makeTask({ id: 'later', priority: 'medium', dueDate: '2026-08-10' });
    const sooner = makeTask({ id: 'sooner', priority: 'medium', dueDate: '2026-08-01' });
    expect(sortTasksForDisplay([later, sooner]).map((t) => t.id)).toEqual(['sooner', 'later']);
  });

  it('sorts undated tasks after every dated task in the same tier', () => {
    const dated = makeTask({ id: 'dated', priority: 'medium', dueDate: '2026-08-01' });
    const undated = makeTask({ id: 'undated', priority: 'medium', dueDate: null });
    expect(sortTasksForDisplay([undated, dated]).map((t) => t.id)).toEqual(['dated', 'undated']);
  });

  it('still applies priority/alpha tie-breakers when both tasks are undated (M3-QA-01 re-review)', () => {
    const zulu = makeTask({ id: 'zulu', name: 'Zulu', priority: 'medium', dueDate: null });
    const alpha = makeTask({ id: 'alpha', name: 'Alpha', priority: 'medium', dueDate: null });
    expect(sortTasksForDisplay([zulu, alpha]).map((t) => t.id)).toEqual(['alpha', 'zulu']);
  });

  it('breaks a both-undated tie by importance before alpha', () => {
    const undatedLow = makeTask({ id: 'low', name: 'Alpha', priority: 'low', dueDate: null });
    const undatedHigh = makeTask({ id: 'high', name: 'Zulu', priority: 'high', dueDate: null });
    expect(sortTasksForDisplay([undatedLow, undatedHigh]).map((t) => t.id)).toEqual([
      'high',
      'low',
    ]);
  });

  it('breaks a date tie by importance (high before medium before low)', () => {
    const medium = makeTask({ id: 'medium', priority: 'medium', dueDate: '2026-08-01' });
    const high = makeTask({ id: 'high', priority: 'high', dueDate: '2026-08-01' });
    const low = makeTask({ id: 'low', priority: 'low', dueDate: '2026-08-01' });
    expect(sortTasksForDisplay([medium, low, high]).map((t) => t.id)).toEqual([
      'high',
      'medium',
      'low',
    ]);
  });

  it('breaks a date and importance tie alphabetically by name', () => {
    const b = makeTask({ id: 'b', name: 'Bravo', priority: 'medium', dueDate: '2026-08-01' });
    const a = makeTask({ id: 'a', name: 'Alpha', priority: 'medium', dueDate: '2026-08-01' });
    expect(sortTasksForDisplay([b, a]).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('sorts a visible urgent closed task ahead of non-urgent open work, per AC-G4 (M3-QA-01 re-review)', () => {
    // AC-G4 names exactly urgent/date/importance/alpha as sort keys, with no
    // closed/open key — closed-task *visibility* is a separate, already
    // approved preference (ClosedTaskVisibilityPrefs). A closed task the
    // user has chosen to keep visible sorts like any other task.
    const urgentClosed = makeTask({
      id: 'urgent-closed',
      status: 'complete',
      priority: 'urgent',
      dueDate: '2026-01-01',
    });
    const openLow = makeTask({
      id: 'open-low',
      status: 'not_started',
      priority: 'low',
      dueDate: null,
    });
    expect(sortTasksForDisplay([openLow, urgentClosed]).map((t) => t.id)).toEqual([
      'urgent-closed',
      'open-low',
    ]);
  });

  it('does not mutate the input array', () => {
    const tasks = [makeTask({ id: 'a', name: 'B' }), makeTask({ id: 'b', name: 'A' })];
    const original = [...tasks];
    sortTasksForDisplay(tasks);
    expect(tasks).toEqual(original);
  });
});
