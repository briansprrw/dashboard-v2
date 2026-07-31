// The List recycle bin: lists the actor's own recycled Lists and lets them
// restore or permanently purge one. Purge is a separate confirmed step
// (M4 acceptance: "Destructive confirmations identify object, impact, and
// recovery/purge consequences") — selecting "Delete forever" does not purge
// immediately, it swaps in a second explicit confirmation naming the List.

import { useEffect, useState } from 'react';

import type { SheetDto } from '../../../shared/contracts/dto';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface SheetRecycleBinDialogProps {
  loadRecycled: () => Promise<SheetDto[]>;
  onRestore: (sheetId: string) => Promise<unknown>;
  onPurge: (sheetId: string) => Promise<unknown>;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; sheets: SheetDto[] }
  | { status: 'error'; message: string };

export function SheetRecycleBinDialog({
  loadRecycled,
  onRestore,
  onPurge,
  onClose,
}: SheetRecycleBinDialogProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const containerRef = useDialogFocus<HTMLDivElement>(onClose, confirmPurgeId !== null);

  useEffect(() => {
    let cancelled = false;
    loadRecycled()
      .then((sheets) => {
        if (!cancelled) setState({ status: 'ready', sheets });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load the recycle bin.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [loadRecycled]);

  async function handleRestore(sheetId: string) {
    setPendingId(sheetId);
    setActionError(null);
    try {
      await onRestore(sheetId);
      if (state.status === 'ready') {
        setState({ status: 'ready', sheets: state.sheets.filter((s) => s.id !== sheetId) });
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not restore this List.');
    } finally {
      setPendingId(null);
    }
  }

  async function handlePurge(sheetId: string) {
    setPendingId(sheetId);
    setActionError(null);
    try {
      await onPurge(sheetId);
      if (state.status === 'ready') {
        setState({ status: 'ready', sheets: state.sheets.filter((s) => s.id !== sheetId) });
      }
      setConfirmPurgeId(null);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not permanently delete this List.'
      );
    } finally {
      setPendingId(null);
    }
  }

  const confirmSheet =
    state.status === 'ready' ? state.sheets.find((s) => s.id === confirmPurgeId) : undefined;

  if (confirmSheet) {
    return (
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm permanent deletion"
        data-testid="purge-sheet-confirm-dialog"
        className="dialog"
      >
        <h2 className="dialog__title">Permanently delete "{confirmSheet.displayName}"?</h2>
        <p className="dialog__message">
          This permanently deletes the List and every task and task history it contains. This cannot
          be undone.
        </p>
        {actionError && (
          <p className="field-error" role="alert">
            {actionError}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" onClick={() => setConfirmPurgeId(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn--danger"
            onClick={() => void handlePurge(confirmSheet.id)}
            disabled={pendingId === confirmSheet.id}
          >
            Delete forever
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
      aria-label="List recycle bin"
      data-testid="sheet-recycle-bin-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Recycle bin</h2>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.sheets.length === 0 && (
        <p data-testid="sheet-recycle-bin-empty">No recycled Lists.</p>
      )}
      {state.status === 'ready' && state.sheets.length > 0 && (
        <ul className="recycle-bin__list" data-testid="sheet-recycle-bin-list">
          {state.sheets.map((sheet) => (
            <li key={sheet.id} className="recycle-bin__item">
              <span>{sheet.displayName}</span>
              <div className="recycle-bin__item-actions">
                <button
                  type="button"
                  onClick={() => void handleRestore(sheet.id)}
                  disabled={pendingId === sheet.id}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn--danger"
                  onClick={() => setConfirmPurgeId(sheet.id)}
                  disabled={pendingId === sheet.id}
                >
                  Delete forever
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
