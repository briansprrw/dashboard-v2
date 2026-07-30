// Handles the move-ownership-relinquish confirmation: the server responds
// 409 CONFIRMATION_REQUIRED (task-service.ts `move()`) when a move would
// revoke the mover's own future access to the task, and the client must
// show that exact warning and only resend with `confirmed: true` on
// explicit confirmation — never silently retrying.

import { useState } from 'react';

import type { AccessibleSheetDto } from '../../../shared/contracts/dto';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface MoveTaskDialogProps {
  taskId: string;
  candidateSheets: AccessibleSheetDto[];
  onMove: (taskId: string, destinationSheetId: string, confirmed: boolean) => Promise<void>;
  onClose: () => void;
}

export function MoveTaskDialog({ taskId, candidateSheets, onMove, onClose }: MoveTaskDialogProps) {
  const [destinationSheetId, setDestinationSheetId] = useState(candidateSheets[0]?.id ?? '');
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onClose, confirmationMessage !== null);

  async function attemptMove(confirmed: boolean) {
    setPending(true);
    setError(null);
    try {
      await onMove(taskId, destinationSheetId, confirmed);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        setConfirmationMessage(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong moving this task.');
      }
    } finally {
      setPending(false);
    }
  }

  if (confirmationMessage !== null) {
    return (
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm move"
        data-testid="move-confirmation-dialog"
        className="dialog"
      >
        <h2 className="dialog__title">Confirm move</h2>
        <p className="dialog__message">{confirmationMessage}</p>
        <div className="dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn--danger"
            onClick={() => void attemptMove(true)}
            disabled={pending}
          >
            Confirm move
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
      aria-label="Move task"
      data-testid="move-task-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Move task</h2>
      <label className="field">
        <span>Destination List</span>
        <select
          value={destinationSheetId}
          onChange={(e) => setDestinationSheetId(e.target.value)}
          data-testid="move-destination-select"
        >
          {candidateSheets.map((sheet) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.displayName}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn--primary"
          onClick={() => void attemptMove(false)}
          disabled={pending || destinationSheetId === ''}
        >
          Move
        </button>
      </div>
    </div>
  );
}
