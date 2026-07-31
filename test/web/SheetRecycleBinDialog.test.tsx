import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SheetRecycleBinDialog } from '../../src/web/components/sheets/SheetRecycleBinDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

describe('SheetRecycleBinDialog', () => {
  it('shows the empty message when there are no recycled Lists', async () => {
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([])}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByTestId('sheet-recycle-bin-empty')).toBeInTheDocument();
  });

  it('lists recycled Lists by name', async () => {
    const sheet = makeSheet({ displayName: 'Old Errands', state: 'recycled' });
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([sheet])}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Old Errands')).toBeInTheDocument();
  });

  it('restores a List and removes it from the visible list on success', async () => {
    const sheet = makeSheet({ displayName: 'Old Errands', state: 'recycled' });
    const onRestore = vi.fn().mockResolvedValue(undefined);
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([sheet])}
        onRestore={onRestore}
        onPurge={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await vi.waitFor(() => expect(onRestore).toHaveBeenCalledWith(sheet.id));
    await vi.waitFor(() =>
      expect(screen.getByTestId('sheet-recycle-bin-empty')).toBeInTheDocument()
    );
  });

  it('requires a second explicit confirmation naming the List before purging (M4 acceptance)', async () => {
    const sheet = makeSheet({ displayName: 'Old Errands', state: 'recycled' });
    const onPurge = vi.fn().mockResolvedValue(undefined);
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([sheet])}
        onRestore={vi.fn()}
        onPurge={onPurge}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete forever' }));
    // First click only opens the confirmation — it must not purge yet.
    expect(onPurge).not.toHaveBeenCalled();

    const confirmDialog = await screen.findByTestId('purge-sheet-confirm-dialog');
    expect(confirmDialog).toHaveTextContent('Old Errands');
    expect(confirmDialog).toHaveTextContent('cannot be undone');

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    await vi.waitFor(() => expect(onPurge).toHaveBeenCalledWith(sheet.id));
  });

  it('cancelling the purge confirmation never purges', async () => {
    const sheet = makeSheet({ displayName: 'Old Errands', state: 'recycled' });
    const onPurge = vi.fn();
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([sheet])}
        onRestore={vi.fn()}
        onPurge={onPurge}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete forever' }));
    await screen.findByTestId('purge-sheet-confirm-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('purge-sheet-confirm-dialog')).not.toBeInTheDocument();
    expect(onPurge).not.toHaveBeenCalled();
  });

  it('shows a load error instead of a silently empty list', async () => {
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockRejectedValue(new ApiError(500, 'INTERNAL', 'Server error.'))}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('closes on the Close button', async () => {
    const onClose = vi.fn();
    render(
      <SheetRecycleBinDialog
        loadRecycled={vi.fn().mockResolvedValue([])}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onClose={onClose}
      />
    );

    await screen.findByTestId('sheet-recycle-bin-empty');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
