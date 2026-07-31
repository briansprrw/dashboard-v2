// Recycle-List confirmation. M4 acceptance: "Destructive confirmations
// identify object, impact, and recovery/purge consequences" — the message
// names the List and states both what happens now (moves to the recycle
// bin with its tasks) and what happens later (eligible for purge after the
// retention window), so the actor never confirms a consequence they were not
// told about.

import { useState } from 'react';

import type { SheetDto } from '../../../shared/contracts/dto';
import { RECYCLE_RETENTION_DAYS } from '../../../shared/domain/limits';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface RecycleSheetDialogProps {
  sheet: SheetDto;
  onRecycle: () => Promise<unknown>;
  onCancel: () => void;
}

export function RecycleSheetDialog({ sheet, onRecycle, onCancel }: RecycleSheetDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onCancel);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onRecycle();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong recycling this List.');
      setPending(false);
    }
  }

  return (
    <div
      ref={containerRef}
      role="alertdialog"
      aria-modal="true"
      aria-label="Recycle List"
      data-testid="recycle-sheet-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Recycle "{sheet.displayName}"?</h2>
      <p className="dialog__message">
        This List and all of its tasks move to the recycle bin. You can restore it from there within{' '}
        {RECYCLE_RETENTION_DAYS} days, after which it becomes eligible for permanent deletion.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn--danger"
          onClick={() => void handleConfirm()}
          disabled={pending}
        >
          Recycle List
        </button>
      </div>
    </div>
  );
}
