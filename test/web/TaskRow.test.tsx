import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskRow } from '../../src/web/components/tasks/TaskRow';
import type { TaskPriority, TaskStatus } from '../../src/shared/domain/enums';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../src/shared/domain/enums';
import { makeTask } from './fixtures';

const NOW = new Date('2026-07-15T12:00:00Z');

describe('TaskRow', () => {
  it.each(TASK_STATUSES)(
    'renders a text label for status %s, not just an icon',
    (status: TaskStatus) => {
      render(
        <ul>
          <TaskRow task={makeTask({ status })} now={NOW} />
        </ul>
      );
      expect(screen.getByTestId('task-row').textContent).toMatch(/\S/);
    }
  );

  it.each(TASK_PRIORITIES)('renders every priority value %s', (priority: TaskPriority) => {
    render(
      <ul>
        <TaskRow task={makeTask({ priority })} now={NOW} />
      </ul>
    );
    expect(screen.getByTestId('task-row')).toBeInTheDocument();
  });

  it('renders TBD for a missing due date', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ dueDate: null })} now={NOW} />
      </ul>
    );
    // "TBD" legitimately appears twice for an unscheduled task: once as the
    // date itself, once as the redundant band text label (AC-G2) — both
    // instances are asserted rather than picking one arbitrarily.
    expect(screen.getAllByText('TBD')).toHaveLength(2);
  });

  it('renders long task names in full (no silent truncation in markup)', () => {
    const longName = 'A'.repeat(300);
    render(
      <ul>
        <TaskRow task={makeTask({ name: longName })} now={NOW} />
      </ul>
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it('shows a note indicator without ever rendering redacted note text', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ notes: null, notesRedacted: true })} now={NOW} />
      </ul>
    );
    const note = screen.getByTestId('task-row-note');
    expect(note).toBeInTheDocument();
    expect(note.textContent).not.toContain('null');
  });

  it('shows a plain note indicator when the note is visible to this caller', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ notes: 'Some note', notesRedacted: false })} now={NOW} />
      </ul>
    );
    expect(screen.getByTestId('task-row-note')).toBeInTheDocument();
  });

  it('shows no note indicator when there is no note at all', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ notes: null, notesRedacted: false })} now={NOW} />
      </ul>
    );
    expect(screen.queryByTestId('task-row-note')).not.toBeInTheDocument();
  });

  it('renders emoji flags when present', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ emojiFlags: ['🔥', '⭐'] })} now={NOW} />
      </ul>
    );
    expect(screen.getByTestId('task-row-flags')).toHaveTextContent('🔥 ⭐');
  });

  it('carries the due band as a data attribute and a redundant text label together', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ dueDate: '2026-07-10', status: 'not_started' })} now={NOW} />
      </ul>
    );
    const row = screen.getByTestId('task-row');
    expect(row).toHaveAttribute('data-due-band', 'overdue');
    expect(row.textContent).toContain('Overdue');
  });

  it('shows no mutation controls when no actions are provided', () => {
    render(
      <ul>
        <TaskRow task={makeTask()} now={NOW} />
      </ul>
    );
    expect(screen.queryByLabelText('Quick complete')).not.toBeInTheDocument();
  });

  it('shows no mutation controls for a viewer, even with actions provided (affordance gating)', () => {
    render(
      <ul>
        <TaskRow
          task={makeTask()}
          now={NOW}
          actions={{
            accessLevel: 'viewer',
            onQuickComplete: vi.fn(),
            onEdit: vi.fn(),
            onMove: vi.fn(),
            onRecycle: vi.fn(),
          }}
        />
      </ul>
    );
    expect(screen.queryByLabelText('Quick complete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-row-recycle')).not.toBeInTheDocument();
  });

  it('uses a per-device emoji override for status and priority icons when provided (M3-QA-03)', () => {
    render(
      <ul>
        <TaskRow
          task={makeTask({ status: 'complete', priority: 'urgent' })}
          now={NOW}
          emojiOverrides={{ status: { complete: '🎉' }, priority: { urgent: '🔥' } }}
        />
      </ul>
    );
    const row = screen.getByTestId('task-row');
    expect(row.textContent).toContain('🎉');
    expect(row.textContent).toContain('🔥');
  });

  it('falls back to the built-in icon for a status/priority with no override', () => {
    render(
      <ul>
        <TaskRow
          task={makeTask({ status: 'complete', priority: 'low' })}
          now={NOW}
          emojiOverrides={{ status: {}, priority: {} }}
        />
      </ul>
    );
    expect(screen.getByTestId('task-row').textContent).toContain('✅');
  });

  it('shows mutation controls for an editor and wires quick-complete to the task', () => {
    const onQuickComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <ul>
        <TaskRow
          task={makeTask()}
          now={NOW}
          actions={{
            accessLevel: 'editor',
            onQuickComplete,
            onEdit: vi.fn(),
            onMove: vi.fn(),
            onRecycle: vi.fn(),
          }}
        />
      </ul>
    );
    fireEvent.click(screen.getByLabelText('Quick complete'));
    expect(onQuickComplete).toHaveBeenCalledTimes(1);
  });

  it('disables the row actions while quick-complete is pending, preventing a duplicate request (M3-QA-04 re-review)', async () => {
    let resolveQuickComplete: (() => void) | undefined;
    const onQuickComplete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveQuickComplete = resolve;
        })
    );
    render(
      <ul>
        <TaskRow
          task={makeTask()}
          now={NOW}
          actions={{
            accessLevel: 'editor',
            onQuickComplete,
            onEdit: vi.fn(),
            onMove: vi.fn(),
            onRecycle: vi.fn().mockResolvedValue(undefined),
          }}
        />
      </ul>
    );

    fireEvent.click(screen.getByLabelText('Quick complete'));
    expect(screen.getByLabelText('Quick complete')).toBeDisabled();

    // A second click while the first is still in flight must not issue a
    // second request.
    fireEvent.click(screen.getByLabelText('Quick complete'));
    expect(onQuickComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('task-row-recycle')).toBeDisabled();

    resolveQuickComplete?.();
    await vi.waitFor(() => expect(screen.getByLabelText('Quick complete')).not.toBeDisabled());
  });
});
