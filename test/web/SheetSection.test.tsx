import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SheetSection } from '../../src/web/components/sheets/SheetSection';
import { makeSheet, makeTask } from './fixtures';

describe('SheetSection', () => {
  it('renders the sheet name and one row per task', () => {
    const sheet = makeSheet({ displayName: 'Work' });
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
    render(<SheetSection sheet={sheet} tasks={tasks} />);

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getAllByTestId('task-row')).toHaveLength(2);
  });

  it('renders an explicit empty-section message instead of an unexplained empty list', () => {
    const sheet = makeSheet();
    render(<SheetSection sheet={sheet} tasks={[]} />);

    expect(screen.getByTestId('sheet-section-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('task-row')).not.toBeInTheDocument();
  });

  it('hides its tasks when collapsed and shows them when expanded', () => {
    const sheet = makeSheet();
    const tasks = [makeTask({ id: 't1' })];
    const { rerender } = render(<SheetSection sheet={sheet} tasks={tasks} collapsed={true} />);
    expect(screen.queryByTestId('task-row')).not.toBeInTheDocument();

    rerender(<SheetSection sheet={sheet} tasks={tasks} collapsed={false} />);
    expect(screen.getByTestId('task-row')).toBeInTheDocument();
  });

  it('calls onToggleCollapsed with the sheet id when its title is activated', () => {
    const sheet = makeSheet({ id: 'sheet-42' });
    const onToggleCollapsed = vi.fn();
    render(<SheetSection sheet={sheet} tasks={[]} onToggleCollapsed={onToggleCollapsed} />);

    fireEvent.click(screen.getByRole('button', { name: sheet.displayName }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('sheet-42');
  });
});
