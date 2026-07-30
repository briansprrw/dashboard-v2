// A 10-second Undo window (B12, AC-G11) for quick-complete, move, and
// recycle. The underlying mutation always happens immediately and for
// real — this hook never rolls back local-only state. Activating Undo
// issues a second, real, compensating mutation (e.g. `restoreTask` after a
// recycle), so the server and the UI can never disagree about what
// happened. This is the "avoid optimistic state that cannot be reconciled
// safely" reading from M3.4's own packet wording.

import { useCallback, useRef, useState } from 'react';

const UNDO_WINDOW_MS = 10_000;

export interface UndoableActionState {
  /** Present only while the window is open; null once expired or dismissed. */
  pendingUndo: { label: string } | null;
  /**
   * True while at least one compensating mutation is in flight (M3-QA-04
   * re-review): the offered Undo affordance is a single banner at a time,
   * but a user can activate Undo on one action, then take a new action and
   * activate Undo on *that* one too before the first compensation has
   * settled — two real, independent server calls can genuinely overlap.
   * Backed by a count, not a plain boolean, so the earlier one finishing
   * first does not clear this while the later one is still running.
   */
  undoPending: boolean;
  /**
   * Set when the compensating mutation itself rejects (M3-QA-04): the
   * original action already committed, so a failed Undo must say so rather
   * than leave the UI silently unchanged as if nothing had been clicked.
   */
  undoError: string | null;
  undo: () => void;
  /** Clears any pending Undo without running its compensating action (M3-QA-05: offline closes it, not runs it). */
  dismiss: () => void;
}

export interface RunUndoableOptions {
  /** Text shown alongside the Undo affordance, e.g. "Task recycled." */
  label: string;
  /** The real, already-committed action's compensating action, e.g. restoreTask(id). */
  compensate: () => Promise<void>;
}

export function useUndoableAction(): UndoableActionState & {
  offerUndo: (options: RunUndoableOptions) => void;
} {
  const [pendingUndo, setPendingUndo] = useState<{ label: string } | null>(null);
  const [undoPendingCount, setUndoPendingCount] = useState(0);
  const [undoError, setUndoError] = useState<string | null>(null);
  const compensateRef = useRef<(() => Promise<void>) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    compensateRef.current = null;
    setPendingUndo(null);
  }, []);

  const offerUndo = useCallback(
    ({ label, compensate }: RunUndoableOptions) => {
      clear();
      setUndoError(null);
      compensateRef.current = compensate;
      setPendingUndo({ label });
      timeoutRef.current = setTimeout(clear, UNDO_WINDOW_MS);
    },
    [clear]
  );

  const undo = useCallback(() => {
    const compensate = compensateRef.current;
    clear();
    // Deliberately does not clear `undoError` here (only `offerUndo` does,
    // for a genuinely fresh action): if an earlier, still-in-flight Undo
    // fails after a second Undo has already been activated, clearing here
    // would erase the first one's real failure the moment it finally
    // reports it, misattributing the outcome to the newer operation.
    if (compensate) {
      setUndoPendingCount((count) => count + 1);
      void compensate()
        .catch(() => {
          setUndoError(
            'Undo failed — the change may not have been reverted. Please check and retry.'
          );
        })
        .finally(() => {
          setUndoPendingCount((count) => count - 1);
        });
    }
  }, [clear]);

  const dismiss = useCallback(() => {
    clear();
  }, [clear]);

  return {
    pendingUndo,
    undoPending: undoPendingCount > 0,
    undoError,
    undo,
    dismiss,
    offerUndo,
  };
}
