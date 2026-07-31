// Rename-List dialog. Mirrors `TaskForm`'s single-field submit/cancel shape
// and `MoveTaskDialog`'s dialog chrome, rather than introducing a third
// pattern for what is otherwise the same "modal form with one text field."

import { useState, type FormEvent } from 'react';

import type { SheetDto } from '../../../shared/contracts/dto';
import { LIMITS } from '../../../shared/domain/limits';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface RenameSheetDialogProps {
  sheet: SheetDto;
  onRename: (displayName: string) => Promise<unknown>;
  onCancel: () => void;
}

export function RenameSheetDialog({ sheet, onRename, onCancel }: RenameSheetDialogProps) {
  const [displayName, setDisplayName] = useState(sheet.displayName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLFormElement>(onCancel);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (displayName.trim().length === 0) {
      setError('Enter a List name.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onRename(displayName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong renaming this List.');
      setPending(false);
    }
  }

  return (
    <form
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Rename List"
      data-testid="rename-sheet-dialog"
      className="dialog"
      onSubmit={(e) => void handleSubmit(e)}
    >
      <h2 className="dialog__title">Rename List</h2>
      <label className="field">
        <span>List name</span>
        <input
          type="text"
          value={displayName}
          maxLength={LIMITS.sheetName.max}
          onChange={(e) => setDisplayName(e.target.value)}
          data-testid="rename-sheet-input"
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn--primary" disabled={pending}>
          Rename
        </button>
      </div>
    </form>
  );
}
