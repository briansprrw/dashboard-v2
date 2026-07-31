import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TransferOwnershipDialog } from '../../src/web/components/sheets/TransferOwnershipDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

describe('TransferOwnershipDialog', () => {
  it('requires a lookup before any confirmation step is reachable', () => {
    render(
      <TransferOwnershipDialog
        sheet={makeSheet()}
        lookupUser={vi.fn()}
        onTransfer={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId('transfer-lookup-result')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transfer-ownership-confirm-dialog')).not.toBeInTheDocument();
  });

  it('looks up the destination email and shows their name before offering to continue', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Priya' });
    render(
      <TransferOwnershipDialog
        sheet={makeSheet({ displayName: 'Errands' })}
        lookupUser={lookupUser}
        onTransfer={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('transfer-email-input'), {
      target: { value: 'priya@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByTestId('transfer-lookup-result')).toHaveTextContent('Priya');
    expect(lookupUser).toHaveBeenCalledWith('priya@example.invalid');
  });

  it('names the List and the destination account in the confirmation step, and only transfers on explicit confirm', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Priya' });
    const onTransfer = vi.fn().mockResolvedValue(undefined);
    render(
      <TransferOwnershipDialog
        sheet={makeSheet({ displayName: 'Errands' })}
        lookupUser={lookupUser}
        onTransfer={onTransfer}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('transfer-email-input'), {
      target: { value: 'priya@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    const confirmDialog = await screen.findByTestId('transfer-ownership-confirm-dialog');
    expect(confirmDialog).toHaveTextContent('Errands');
    expect(confirmDialog).toHaveTextContent('Priya');
    expect(onTransfer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await vi.waitFor(() => expect(onTransfer).toHaveBeenCalledWith('user-9'));
  });

  it('"Back" from the confirmation does not transfer', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Priya' });
    const onTransfer = vi.fn();
    render(
      <TransferOwnershipDialog
        sheet={makeSheet()}
        lookupUser={lookupUser}
        onTransfer={onTransfer}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('transfer-email-input'), {
      target: { value: 'priya@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByTestId('transfer-ownership-confirm-dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('transfer-ownership-confirm-dialog')).not.toBeInTheDocument();
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('shows a distinct message for an email with no account (404)', async () => {
    const lookupUser = vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found.'));
    render(
      <TransferOwnershipDialog
        sheet={makeSheet()}
        lookupUser={lookupUser}
        onTransfer={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('transfer-email-input'), {
      target: { value: 'nobody@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('No account found for that email.')).toBeInTheDocument();
  });

  it('shows the server error on a denied transfer without silently closing', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Priya' });
    const onTransfer = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Owners only.'));
    render(
      <TransferOwnershipDialog
        sheet={makeSheet()}
        lookupUser={lookupUser}
        onTransfer={onTransfer}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('transfer-email-input'), {
      target: { value: 'priya@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Transfer ownership' }));

    expect(await screen.findByText('Owners only.')).toBeInTheDocument();
  });
});
