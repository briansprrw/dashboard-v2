import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUndoableAction } from '../../src/web/hooks/use-undoable-action';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUndoableAction', () => {
  it('starts with no pending undo', () => {
    const { result } = renderHook(() => useUndoableAction());
    expect(result.current.pendingUndo).toBeNull();
  });

  it('offers an undo window after an action, with the given label', () => {
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({
        label: 'Task recycled.',
        compensate: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(result.current.pendingUndo).toEqual({ label: 'Task recycled.' });
  });

  it('calling undo runs the real compensating action, not a local-only rollback', () => {
    const compensate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({ label: 'Task moved.', compensate });
    });
    act(() => {
      result.current.undo();
    });
    expect(compensate).toHaveBeenCalledTimes(1);
    expect(result.current.pendingUndo).toBeNull();
  });

  it('the undo window expires after 10 seconds, after which undo is no longer offered', () => {
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({
        label: 'Task completed.',
        compensate: vi.fn().mockResolvedValue(undefined),
      });
    });
    expect(result.current.pendingUndo).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.pendingUndo).toBeNull();
  });

  it('surfaces a visible error when the compensating action itself rejects (M3-QA-04)', async () => {
    const compensate = vi
      .fn()
      .mockRejectedValue(new Error('server rejected the compensating call'));
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({ label: 'Task recycled.', compensate });
    });

    await act(async () => {
      result.current.undo();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.undoError).not.toBeNull();
    expect(result.current.pendingUndo).toBeNull();
  });

  it('reports undoPending while a slow compensating action is in flight, and clears it once resolved (M3-QA-04 re-review)', async () => {
    let resolveCompensate: (() => void) | undefined;
    const compensate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCompensate = resolve;
        })
    );
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({ label: 'Task moved.', compensate });
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.undoPending).toBe(true);
    // The Undo banner itself is gone (the window has closed), but the
    // pending state must still be visible — this is exactly the gap the
    // re-review found: nothing rendered during a slow compensation.
    expect(result.current.pendingUndo).toBeNull();

    await act(async () => {
      resolveCompensate?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.undoPending).toBe(false);
  });

  it('keeps undoPending true while a second, overlapping compensation is still running after the first finishes (M3-QA-04 re-review)', async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const firstCompensate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const secondCompensate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSecond = resolve;
        })
    );
    const { result } = renderHook(() => useUndoableAction());

    // Undo A: activated, still in flight.
    act(() => {
      result.current.offerUndo({ label: 'First.', compensate: firstCompensate });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.undoPending).toBe(true);

    // A second, unrelated action is offered and undone before A settles —
    // two real compensating mutations now genuinely overlap.
    act(() => {
      result.current.offerUndo({ label: 'Second.', compensate: secondCompensate });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.undoPending).toBe(true);

    // A finishes first. B is still running, so pending must stay true —
    // this is exactly the bug the re-review found (a shared boolean would
    // flip to false here even though B has not settled).
    await act(async () => {
      resolveFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.undoPending).toBe(true);

    await act(async () => {
      resolveSecond?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.undoPending).toBe(false);
  });

  it('does not let a second Undo suppress a real failure later reported by an earlier, still-in-flight compensation (M3-QA-04 re-review)', async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const firstCompensate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        })
    );
    const secondCompensate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAction());

    act(() => {
      result.current.offerUndo({ label: 'First.', compensate: firstCompensate });
    });
    act(() => {
      result.current.undo();
    });

    // Starting a second Undo previously cleared `undoError` unconditionally,
    // which would erase the first Undo's real failure once it finally
    // reports it below.
    act(() => {
      result.current.offerUndo({ label: 'Second.', compensate: secondCompensate });
    });
    act(() => {
      result.current.undo();
    });

    await act(async () => {
      rejectFirst?.(new Error('server rejected the first compensating call'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.undoError).not.toBeNull();
  });

  it('dismiss clears the pending Undo without running the compensating action (M3-QA-05)', () => {
    const compensate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAction());
    act(() => {
      result.current.offerUndo({ label: 'Task recycled.', compensate });
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.pendingUndo).toBeNull();
    expect(compensate).not.toHaveBeenCalled();
  });

  it('a second offer replaces the first rather than stacking', () => {
    const firstCompensate = vi.fn().mockResolvedValue(undefined);
    const secondCompensate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableAction());

    act(() => {
      result.current.offerUndo({ label: 'First.', compensate: firstCompensate });
    });
    act(() => {
      result.current.offerUndo({ label: 'Second.', compensate: secondCompensate });
    });
    expect(result.current.pendingUndo).toEqual({ label: 'Second.' });

    act(() => {
      result.current.undo();
    });
    expect(secondCompensate).toHaveBeenCalledTimes(1);
    expect(firstCompensate).not.toHaveBeenCalled();
  });
});
