import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateSheetDialog } from '../../src/web/components/sheets/CreateSheetDialog';
import { ApiError } from '../../src/web/lib/api-client';

describe('CreateSheetDialog', () => {
  it('submits the entered name', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateSheetDialog onCreate={onCreate} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('create-sheet-input'), {
      target: { value: 'Groceries' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledWith('Groceries'));
  });

  it('refuses to submit an empty name without calling onCreate', () => {
    const onCreate = vi.fn();
    render(<CreateSheetDialog onCreate={onCreate} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a List name.');
  });

  it('shows the server error on a denied create', async () => {
    const onCreate = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Not allowed.'));
    render(<CreateSheetDialog onCreate={onCreate} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('create-sheet-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
  });

  it('cancel does not create', () => {
    const onCreate = vi.fn();
    const onCancel = vi.fn();
    render(<CreateSheetDialog onCreate={onCreate} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onCancel = vi.fn();
    render(<CreateSheetDialog onCreate={vi.fn()} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
