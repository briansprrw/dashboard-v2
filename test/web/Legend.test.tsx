// Legend (M3.6-D3, resolved by Brian 2026-07-30 as "Legend yes, FAB no").
//
// The behaviour worth pinning is not that it renders chips — it is that the
// key can never disagree with the task rows it explains: it must follow the
// user's icon overrides and their configured due thresholds, and it must stay
// collapsed until asked for so Glance density is unaffected.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Legend } from '../../src/web/components/dashboard/Legend';

describe('Legend', () => {
  it('starts collapsed so it costs no Glance density until requested', () => {
    render(<Legend />);
    expect(screen.queryByTestId('legend-body')).not.toBeInTheDocument();
    expect(screen.getByTestId('legend-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands and collapses again from the same control', () => {
    render(<Legend />);
    const toggle = screen.getByTestId('legend-toggle');

    fireEvent.click(toggle);
    expect(screen.getByTestId('legend-body')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('legend-body')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('names all seven due bands with the caller thresholds, not the built-in defaults', () => {
    render(<Legend dueThresholds={{ soonMaxDays: 2, soonishMaxDays: 9 }} />);
    fireEvent.click(screen.getByTestId('legend-toggle'));
    const due = within(screen.getByTestId('legend-row-due'));

    expect(due.getByText('Overdue')).toBeInTheDocument();
    expect(due.getByText('Due today')).toBeInTheDocument();
    expect(due.getByText('1-2 days')).toBeInTheDocument();
    expect(due.getByText('3-9 days')).toBeInTheDocument();
    expect(due.getByText('10+ days')).toBeInTheDocument();
    expect(due.getByText('No due date')).toBeInTheDocument();
    // Named for what the band actually covers: `computeDueBand` puts cancelled
    // tasks here too, and the Status row separately has its own "Complete".
    expect(due.getByText('Complete or cancelled')).toBeInTheDocument();
    expect(due.queryByText('Complete')).not.toBeInTheDocument();
  });

  it('collapses a single-day soon band to "1 day" rather than "1-1 days"', () => {
    render(<Legend dueThresholds={{ soonMaxDays: 1, soonishMaxDays: 2 }} />);
    fireEvent.click(screen.getByTestId('legend-toggle'));

    expect(screen.getByText('1 day')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();
  });

  it('shows the user icon overrides, so the key matches what the rows render', () => {
    // `EmojiOverrides` holds only the keys a user actually changed, never a
    // full copy of the defaults, so an unset key must still fall back.
    render(<Legend emojiOverrides={{ status: { blocked: '🚧' }, priority: { urgent: '🔥' } }} />);
    fireEvent.click(screen.getByTestId('legend-toggle'));

    expect(screen.getByText('🚧')).toBeInTheDocument();
    expect(screen.getByText('🔥')).toBeInTheDocument();
    // The built-in defaults for those two must be gone, not merely joined.
    expect(screen.queryByText('⛔️')).not.toBeInTheDocument();
    expect(screen.queryByText('☢️')).not.toBeInTheDocument();
  });

  it('pairs every icon with its text label, so no entry is icon-only (AC-G2)', () => {
    render(<Legend />);
    fireEvent.click(screen.getByTestId('legend-toggle'));

    const status = within(screen.getByTestId('legend-row-status'));
    for (const label of [
      'Not started',
      'In progress',
      'Pending',
      'Blocked',
      'Complete',
      'Cancelled',
    ]) {
      expect(status.getByText(label, { exact: false })).toBeInTheDocument();
    }

    const priority = within(screen.getByTestId('legend-row-priority'));
    for (const label of ['Low priority', 'Medium priority', 'High priority', 'Urgent priority']) {
      expect(priority.getByText(label, { exact: false })).toBeInTheDocument();
    }
  });
});
