// Create-List dialog (M4-QA-01). Mirrors `RenameSheetDialog`'s single-field
// submit/cancel shape; the only difference is starting from an empty name
// rather than seeding one from an existing sheet.

import { useState, type FormEvent } from 'react';

import { LIMITS } from '../../../shared/domain/limits';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface CreateSheetDialogProps {
  onCreate: (displayName: string) => Promise<unknown>;
  onCancel: () => void;
}

export function CreateSheetDialog({ onCreate, onCancel }: CreateSheetDialogProps) {
  const [displayName, setDisplayName] = useState('');
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
      await onCreate(displayName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong creating this List.');
      setPending(false);
    }
  }

  return (
    <form
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="New List"
      data-testid="create-sheet-dialog"
      className="dialog"
      onSubmit={(e) => void handleSubmit(e)}
    >
      <h2 className="dialog__title">New List</h2>
      <label className="field">
        <span>List name</span>
        <input
          type="text"
          value={displayName}
          maxLength={LIMITS.sheetName.max}
          onChange={(e) => setDisplayName(e.target.value)}
          data-testid="create-sheet-input"
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
          Create
        </button>
      </div>
    </form>
  );
}
