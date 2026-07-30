import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoveTaskDialog } from '../../src/web/components/tasks/MoveTaskDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

describe('MoveTaskDialog', () => {
  it('calls onMove with confirmed:false on the first attempt', async () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onMove = vi.fn().mockResolvedValue(undefined);
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={onMove}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('task-1', 'sheet-2', false));
  });

  it('shows the server confirmation warning and does not move again until explicitly confirmed', async () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onMove = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'CONFIRMATION_REQUIRED',
          'This will make the task visible only to the new owner.'
        )
      )
      .mockResolvedValueOnce(undefined);
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={onMove}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(
      await screen.findByText('This will make the task visible only to the new owner.')
    ).toBeInTheDocument();
    expect(onMove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));
    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('task-1', 'sheet-2', true));
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('cancelling the confirmation dialog never resends the move', async () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onClose = vi.fn();
    const onMove = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'CONFIRMATION_REQUIRED', 'Warning.'));
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={onMove}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await screen.findByTestId('move-confirmation-dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape (M3-QA-09)', () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onClose = vi.fn();
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('re-focuses into the confirmation dialog when the phase switches (M3-QA-09)', async () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onMove = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'CONFIRMATION_REQUIRED', 'Warning.'));
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={onMove}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    const confirmation = await screen.findByTestId('move-confirmation-dialog');

    // The requirement (M3-QA-09) is that focus moves *into* the newly rendered
    // confirmation phase rather than being left behind on the dismissed
    // destination form. `useDialogFocus` focuses the first focusable element,
    // which is now Cancel: the design system's `.dialog__actions` orders
    // actions Cancel-then-primary (approved mockup's `.panel-actions`), so the
    // initial focus of a destructive confirmation lands on the safe choice.
    // Previously this happened to be "Confirm move" purely because it came
    // first in the DOM.
    expect(confirmation).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('shows a plain denial message for a 403, distinct from the confirmation dialog', async () => {
    const destination = makeSheet({ id: 'sheet-2', displayName: 'Other List' });
    const onMove = vi
      .fn()
      .mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'You cannot move this task.'));
    render(
      <MoveTaskDialog
        taskId="task-1"
        candidateSheets={[destination]}
        onMove={onMove}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot move this task.');
    expect(screen.queryByTestId('move-confirmation-dialog')).not.toBeInTheDocument();
  });
});
