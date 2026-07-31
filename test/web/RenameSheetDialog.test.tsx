import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RenameSheetDialog } from '../../src/web/components/sheets/RenameSheetDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

describe('RenameSheetDialog', () => {
  it('submits the edited name', async () => {
    const sheet = makeSheet({ displayName: 'Before' });
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(<RenameSheetDialog sheet={sheet} onRename={onRename} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('rename-sheet-input'), { target: { value: 'After' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await vi.waitFor(() => expect(onRename).toHaveBeenCalledWith('After'));
  });

  it('refuses to submit an empty name without calling onRename', () => {
    const sheet = makeSheet({ displayName: 'Before' });
    const onRename = vi.fn();
    render(<RenameSheetDialog sheet={sheet} onRename={onRename} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('rename-sheet-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a List name.');
  });

  it('shows the server error on a denied rename', async () => {
    const sheet = makeSheet({ displayName: 'Before' });
    const onRename = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Not allowed.'));
    render(<RenameSheetDialog sheet={sheet} onRename={onRename} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
  });

  it('closes on Escape', () => {
    const sheet = makeSheet();
    const onCancel = vi.fn();
    render(<RenameSheetDialog sheet={sheet} onRename={vi.fn()} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
