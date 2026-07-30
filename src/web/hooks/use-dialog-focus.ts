// Shared keyboard/dialog baseline for TaskForm and MoveTaskDialog (M3-QA-09,
// confirming prior M3-DEF-01): focus enters the dialog on open, Tab is
// trapped inside it, Escape closes it, and focus returns to whatever
// triggered it on close. `inert` on the background (M3-QA-09's remaining
// baseline item) is applied by the caller (`DashboardView`) directly on the
// non-dialog content, since this hook only owns the dialog's own element.

import { useLayoutEffect, useRef, useState } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Attach the returned ref to the dialog's outermost element. `onClose` is
 * called on Escape; it is not called on unmount, so a caller that closes for
 * another reason (e.g. a successful submit) does not trigger a second close.
 *
 * `refocusPhase` is for a dialog like `MoveTaskDialog` that swaps its own
 * root element mid-dialog (the move-select view becomes a confirmation
 * view): pass a value that changes exactly when that swap happens so focus
 * re-enters the new root, without re-capturing the original trigger element
 * or re-attaching the keydown listener — both must persist across the swap,
 * scoped to the dialog's true mount/unmount instead.
 */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void, refocusPhase?: unknown) {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Captured via a lazy `useState` initializer rather than read directly
  // inside the effect below: React guarantees a lazy initializer runs
  // exactly once per real component instance, so it survives StrictMode's
  // intentional mount -> cleanup -> mount effect double-invocation
  // unchanged. Reading `document.activeElement` inside the effect itself
  // was found (M3-DEF-08, during M3.6 real-browser keyboard evidence) to
  // recapture the *wrong* element on StrictMode's second synthetic mount,
  // since the first mount's own cleanup had already run by then. This was
  // one of two compounding causes of that defect — see the cleanup below
  // for the other.
  const [triggerElement] = useState(() => document.activeElement as HTMLElement | null);

  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const container = containerRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const focusable = focusableElements(container);
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      if (!firstFocusable || !lastFocusable) return;

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Deferred one frame: the caller (`DashboardView`) lifts the
      // background's `inert` attribute in the same commit that unmounts this
      // dialog, and a browser refuses `.focus()` on an element that is still
      // `inert` at the moment of the call. A same-tick `.focus()` here can
      // therefore silently no-op if this cleanup runs before that attribute
      // removal is actually applied to the DOM (M3-DEF-08).
      requestAnimationFrame(() => triggerElement?.focus());
    };
    // `triggerElement` is stable for the component's lifetime (captured once
    // by the lazy `useState` initializer above), so including it here does
    // not change when this effect re-runs — it only satisfies the linter
    // honestly instead of suppressing a real dependency.
  }, [triggerElement]);

  // Re-runs only when `refocusPhase` changes (or once, if the caller never
  // passes one) — deliberately not on every render.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const [first] = container ? focusableElements(container) : [];
    (first ?? container)?.focus();
  }, [refocusPhase]);

  return containerRef;
}
