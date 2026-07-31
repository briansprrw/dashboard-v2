import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SheetPreferencesDialog } from '../../src/web/components/sheets/SheetPreferencesDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

const a = makeSheet({ id: 'a', displayName: 'Alpha' });
const b = makeSheet({ id: 'b', displayName: 'Beta' });
const c = makeSheet({ id: 'c', displayName: 'Gamma' });

describe('SheetPreferencesDialog', () => {
  it('lists every accessible sheet in default order when no preference is set', () => {
    render(
      <SheetPreferencesDialog
        allSheets={[a, b, c]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Beta'),
      expect.stringContaining('Gamma'),
    ]);
  });

  it('moving a sheet up changes the saved order', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SheetPreferencesDialog
        allSheets={[a, b, c]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move Beta up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ sheetOrder: ['b', 'a', 'c'], hiddenSheetIds: [] })
    );
  });

  it('the first item cannot move up and the last cannot move down', () => {
    render(
      <SheetPreferencesDialog
        allSheets={[a, b]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Beta down' })).toBeDisabled();
  });

  it('toggling visibility flips the label and is included on save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SheetPreferencesDialog
        allSheets={[a, b]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    const alphaRow = screen.getByText('Alpha').closest('li')!;
    const toggle = within(alphaRow).getByRole('button', { name: 'Visible' });
    fireEvent.click(toggle);
    expect(within(alphaRow).getByRole('button', { name: 'Hidden' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ sheetOrder: ['a', 'b'], hiddenSheetIds: ['a'] })
    );
  });

  it('cancel does not save', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <SheetPreferencesDialog
        allSheets={[a]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the server error on a failed save without closing', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError(500, 'INTERNAL', 'Save failed.'));
    const onClose = vi.fn();
    render(
      <SheetPreferencesDialog
        allSheets={[a]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save failed.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <SheetPreferencesDialog
        allSheets={[a]}
        preferences={{ sheetOrder: [], hiddenSheetIds: [] }}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
