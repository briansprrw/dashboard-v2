import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecycleSheetDialog } from '../../src/web/components/sheets/RecycleSheetDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

describe('RecycleSheetDialog', () => {
  it('names the List and the recovery consequence in its message (M4 acceptance)', () => {
    const sheet = makeSheet({ displayName: 'Groceries' });
    render(<RecycleSheetDialog sheet={sheet} onRecycle={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Groceries');
    expect(screen.getByText(/moves? to the recycle bin/i)).toBeInTheDocument();
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
  });

  it('confirms recycling on explicit click', async () => {
    const sheet = makeSheet();
    const onRecycle = vi.fn().mockResolvedValue(undefined);
    render(<RecycleSheetDialog sheet={sheet} onRecycle={onRecycle} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recycle List' }));
    await vi.waitFor(() => expect(onRecycle).toHaveBeenCalledTimes(1));
  });

  it('cancel does not recycle', () => {
    const sheet = makeSheet();
    const onRecycle = vi.fn();
    const onCancel = vi.fn();
    render(<RecycleSheetDialog sheet={sheet} onRecycle={onRecycle} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRecycle).not.toHaveBeenCalled();
  });

  it('shows the server error on a denied recycle without closing', async () => {
    const sheet = makeSheet();
    const onRecycle = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Owners only.'));
    render(<RecycleSheetDialog sheet={sheet} onRecycle={onRecycle} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recycle List' }));

    expect(await screen.findByText('Owners only.')).toBeInTheDocument();
  });
});
