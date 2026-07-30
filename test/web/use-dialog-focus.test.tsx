import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDialogFocus } from '../../src/web/hooks/use-dialog-focus';

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div ref={ref} role="dialog" data-testid="dialog">
      <button type="button" data-testid="first">
        First
      </button>
      <button type="button" data-testid="last">
        Last
      </button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </div>
  );
}

describe('useDialogFocus', () => {
  it('focuses the first focusable element inside the dialog on open', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('traps Tab within the dialog: Shift+Tab from the first element wraps to the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('first')).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId('first'), { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('last')).toHaveFocus();
  });

  it('traps Tab within the dialog: Tab from the last element wraps to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    screen.getByTestId('last').focus();

    fireEvent.keyDown(screen.getByTestId('last'), { key: 'Tab' });
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('closes the dialog on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('restores focus to the triggering element once the dialog closes', async () => {
    render(<Harness />);
    const trigger = screen.getByTestId('trigger');
    // `fireEvent.click` does not itself move focus the way a real pointer
    // interaction would — focus the trigger explicitly first, as a real
    // browser would before the dialog opens.
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('first')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    // The restore is deferred one animation frame past the dialog's unmount
    // (M3-DEF-08: a same-tick `.focus()` can silently no-op while the
    // caller's `inert` background attribute is still being lifted in the
    // same commit), so this assertion must wait for that frame too.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(trigger).toHaveFocus();
  });

  it('does not call onClose again on unmount for a different close reason', () => {
    const onClose = vi.fn();
    function ControlledHarness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <>
          <DialogWithHandler
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          />
          <button type="button" data-testid="external-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </>
      ) : null;
    }
    function DialogWithHandler({ onClose: close }: { onClose: () => void }) {
      const ref = useDialogFocus<HTMLDivElement>(close);
      return (
        <div ref={ref} role="dialog">
          <button type="button">Inside</button>
        </div>
      );
    }

    render(<ControlledHarness />);
    fireEvent.click(screen.getByTestId('external-close'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
