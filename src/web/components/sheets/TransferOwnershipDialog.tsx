// Ownership transfer (M4.2): the same exact-email lookup step as
// ManageMembersDialog, then one explicit confirmation naming both the List
// and the destination account before calling the server — transferring
// ownership is the highest-consequence membership action (the current owner
// loses management rights and private-content visibility on this List), so it
// gets its own dialog rather than living inside the members list.

import { useState, type FormEvent } from 'react';

import type { SheetDto, UserLookupDto } from '../../../shared/contracts/dto';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface TransferOwnershipDialogProps {
  sheet: SheetDto;
  lookupUser: (email: string) => Promise<UserLookupDto>;
  onTransfer: (newOwnerUserId: string) => Promise<unknown>;
  onCancel: () => void;
}

export function TransferOwnershipDialog({
  sheet,
  lookupUser,
  onTransfer,
  onCancel,
}: TransferOwnershipDialogProps) {
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<UserLookupDto | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onCancel, confirming);

  async function handleLookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLookupError(null);
    setFound(null);
    setPending(true);
    try {
      setFound(await lookupUser(email));
    } catch (err) {
      setLookupError(
        err instanceof ApiError && err.status === 404
          ? 'No account found for that email.'
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong looking up that email.'
      );
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmTransfer() {
    if (!found) return;
    setPending(true);
    setTransferError(null);
    try {
      await onTransfer(found.userId);
    } catch (err) {
      setTransferError(
        err instanceof ApiError ? err.message : 'Could not transfer ownership of this List.'
      );
      setPending(false);
    }
  }

  if (confirming && found) {
    return (
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm ownership transfer"
        data-testid="transfer-ownership-confirm-dialog"
        className="dialog"
      >
        <h2 className="dialog__title">
          Transfer "{sheet.displayName}" to {found.displayName}?
        </h2>
        <p className="dialog__message">
          You will lose ownership, including the ability to manage members, view private tasks, and
          recycle or purge this List. This cannot be undone by you alone — the new owner would need
          to transfer it back.
        </p>
        {transferError && (
          <p className="field-error" role="alert">
            {transferError}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            Back
          </button>
          <button
            type="button"
            className="btn--danger"
            onClick={() => void handleConfirmTransfer()}
            disabled={pending}
          >
            Transfer ownership
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Transfer ownership"
      data-testid="transfer-ownership-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Transfer ownership of "{sheet.displayName}"</h2>
      <form className="field-row" onSubmit={(e) => void handleLookup(e)}>
        <label className="field">
          <span>New owner's email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(null);
            }}
            data-testid="transfer-email-input"
          />
        </label>
        <button type="submit" disabled={pending || email.trim().length === 0}>
          Find
        </button>
      </form>

      {lookupError && (
        <p className="field-error" role="alert">
          {lookupError}
        </p>
      )}

      {found && (
        <p data-testid="transfer-lookup-result">
          Found: {found.displayName}.{' '}
          <button type="button" className="btn--danger" onClick={() => setConfirming(true)}>
            Continue
          </button>
        </p>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
