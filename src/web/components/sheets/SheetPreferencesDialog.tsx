// Sheet order/visibility (M4.3, M4-D3) — the one server-backed preference.
// Reordering uses explicit "Move up"/"Move down" buttons rather than drag-
// and-drop: a keyboard- and screen-reader-operable control was judged more
// important for a first pass than a richer interaction, and every other
// mutation control in this codebase (recycle, restore, transfer) is a plain
// button for the same reason.

import { useState } from 'react';

import type { AccessibleSheetDto } from '../../../shared/contracts/dto';
import type { SheetPreferences } from '../../../shared/domain/sheet-preferences';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface SheetPreferencesDialogProps {
  /** Every sheet the user can currently see, in the server's default order. */
  allSheets: AccessibleSheetDto[];
  preferences: SheetPreferences;
  onSave: (next: SheetPreferences) => Promise<void>;
  onClose: () => void;
}

/** `sheetOrder` only needs to name sheets the user reordered; fill in the rest in default order. */
function fullOrder(allSheets: AccessibleSheetDto[], sheetOrder: string[]): string[] {
  const known = new Set(sheetOrder.filter((id) => allSheets.some((s) => s.id === id)));
  const rest = allSheets.map((s) => s.id).filter((id) => !known.has(id));
  return [...sheetOrder.filter((id) => known.has(id)), ...rest];
}

export function SheetPreferencesDialog({
  allSheets,
  preferences,
  onSave,
  onClose,
}: SheetPreferencesDialogProps) {
  const [order, setOrder] = useState(() => fullOrder(allSheets, preferences.sheetOrder));
  const [hidden, setHidden] = useState(() => new Set(preferences.hiddenSheetIds));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onClose);

  const byId = new Map(allSheets.map((s) => [s.id, s]));

  function swap(list: string[], i: number, j: number): string[] {
    const next = [...list];
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) return list;
    next[i] = b;
    next[j] = a;
    return next;
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((current) => swap(current, index - 1, index));
  }

  function moveDown(index: number) {
    setOrder((current) => {
      if (index >= current.length - 1) return current;
      return swap(current, index, index + 1);
    });
  }

  function toggleHidden(sheetId: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    try {
      await onSave({ sheetOrder: order, hiddenSheetIds: [...hidden] });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your sheet preferences.');
      setPending(false);
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Sheet order and visibility"
      data-testid="sheet-preferences-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Sheet order and visibility</h2>
      <p className="dialog__message">
        This order and which Lists are hidden follow you to every device you sign in on.
      </p>

      <ul className="recycle-bin__list" data-testid="sheet-preferences-list">
        {order.map((sheetId, index) => {
          const sheet = byId.get(sheetId);
          if (!sheet) return null;
          const isHidden = hidden.has(sheetId);
          return (
            <li key={sheetId} className="recycle-bin__item">
              <span>{sheet.displayName}</span>
              <div className="recycle-bin__item-actions">
                <button
                  type="button"
                  aria-label={`Move ${sheet.displayName} up`}
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  type="button"
                  aria-label={`Move ${sheet.displayName} down`}
                  onClick={() => moveDown(index)}
                  disabled={index === order.length - 1}
                >
                  Down
                </button>
                <button type="button" aria-pressed={isHidden} onClick={() => toggleHidden(sheetId)}>
                  {isHidden ? 'Hidden' : 'Visible'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn--primary"
          onClick={() => void handleSave()}
          disabled={pending}
        >
          Save
        </button>
      </div>
    </div>
  );
}
