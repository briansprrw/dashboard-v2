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

  describe('owner-only lifecycle controls (M4.1)', () => {
    it('shows rename and recycle controls to the owner and calls back with the sheet id', () => {
      const sheet = makeSheet({ id: 'sheet-1', accessLevel: 'owner' });
      const onRenameSheet = vi.fn();
      const onRecycleSheet = vi.fn();
      render(
        <SheetSection
          sheet={sheet}
          tasks={[]}
          onRenameSheet={onRenameSheet}
          onRecycleSheet={onRecycleSheet}
        />
      );

      fireEvent.click(screen.getByTestId('rename-sheet-button'));
      expect(onRenameSheet).toHaveBeenCalledWith('sheet-1');

      fireEvent.click(screen.getByTestId('recycle-sheet-button'));
      expect(onRecycleSheet).toHaveBeenCalledWith('sheet-1');
    });

    it('hides lifecycle controls from an editor', () => {
      const sheet = makeSheet({ accessLevel: 'editor' });
      render(
        <SheetSection sheet={sheet} tasks={[]} onRenameSheet={vi.fn()} onRecycleSheet={vi.fn()} />
      );

      expect(screen.queryByTestId('rename-sheet-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recycle-sheet-button')).not.toBeInTheDocument();
    });

    it('hides lifecycle controls from a viewer', () => {
      const sheet = makeSheet({ accessLevel: 'viewer' });
      render(
        <SheetSection sheet={sheet} tasks={[]} onRenameSheet={vi.fn()} onRecycleSheet={vi.fn()} />
      );

      expect(screen.queryByTestId('rename-sheet-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recycle-sheet-button')).not.toBeInTheDocument();
    });

    it('omits lifecycle controls entirely when the owner has no handlers to call (e.g. offline)', () => {
      const sheet = makeSheet({ accessLevel: 'owner' });
      render(<SheetSection sheet={sheet} tasks={[]} />);

      expect(screen.queryByTestId('rename-sheet-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recycle-sheet-button')).not.toBeInTheDocument();
    });
  });

  describe('owner-only membership/ownership controls (M4.2)', () => {
    it('shows members and transfer controls to the owner and calls back with the sheet id', () => {
      const sheet = makeSheet({ id: 'sheet-1', accessLevel: 'owner' });
      const onManageMembers = vi.fn();
      const onTransferOwnership = vi.fn();
      render(
        <SheetSection
          sheet={sheet}
          tasks={[]}
          onManageMembers={onManageMembers}
          onTransferOwnership={onTransferOwnership}
        />
      );

      fireEvent.click(screen.getByTestId('manage-members-button'));
      expect(onManageMembers).toHaveBeenCalledWith('sheet-1');

      fireEvent.click(screen.getByTestId('transfer-ownership-button'));
      expect(onTransferOwnership).toHaveBeenCalledWith('sheet-1');
    });

    it('hides members and transfer controls from an editor', () => {
      const sheet = makeSheet({ accessLevel: 'editor' });
      render(
        <SheetSection
          sheet={sheet}
          tasks={[]}
          onManageMembers={vi.fn()}
          onTransferOwnership={vi.fn()}
        />
      );

      expect(screen.queryByTestId('manage-members-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transfer-ownership-button')).not.toBeInTheDocument();
    });

    it('hides members and transfer controls from a viewer', () => {
      const sheet = makeSheet({ accessLevel: 'viewer' });
      render(
        <SheetSection
          sheet={sheet}
          tasks={[]}
          onManageMembers={vi.fn()}
          onTransferOwnership={vi.fn()}
        />
      );

      expect(screen.queryByTestId('manage-members-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transfer-ownership-button')).not.toBeInTheDocument();
    });
  });
});
