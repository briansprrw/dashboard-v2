import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DisplaySettings } from '../../src/web/components/settings/DisplaySettings';
import { usePreferences } from '../../src/web/state/use-preferences';

// `DisplaySettings` only ever receives `UsePreferencesResult` from the real
// hook (see `App.tsx`), so this wrapper exercises the same wiring rather
// than a hand-built stub that could drift from the hook's actual shape.
function Wrapper() {
  const prefs = usePreferences();
  return <DisplaySettings prefs={prefs} />;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('DisplaySettings', () => {
  it('rejects an invalid due-threshold submission with a visible error and keeps the prior values', () => {
    render(<Wrapper />);

    fireEvent.change(screen.getByLabelText('Soon up to'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Soonish up to'), { target: { value: '3' } });
    fireEvent.submit(screen.getByTestId('due-thresholds-form'));

    expect(screen.getByRole('alert')).toHaveTextContent('Kept the previous thresholds.');
    // Rejected input must not linger on screen looking saved (M3-DEF-03).
    expect(screen.getByLabelText('Soon up to')).toHaveValue(3);
    expect(screen.getByLabelText('Soonish up to')).toHaveValue(7);
  });

  it('accepts a valid due-threshold submission with no error shown', () => {
    render(<Wrapper />);

    fireEvent.change(screen.getByLabelText('Soon up to'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Soonish up to'), { target: { value: '5' } });
    fireEvent.submit(screen.getByTestId('due-thresholds-form'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Soon up to')).toHaveValue(2);
    expect(screen.getByLabelText('Soonish up to')).toHaveValue(5);
  });

  it('rejects a due-threshold value above the 365-day maximum (M3-QA-08)', () => {
    render(<Wrapper />);

    fireEvent.change(screen.getByLabelText('Soon up to'), { target: { value: '366' } });
    fireEvent.change(screen.getByLabelText('Soonish up to'), { target: { value: '400' } });
    fireEvent.submit(screen.getByTestId('due-thresholds-form'));

    expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 365 days');
    expect(screen.getByLabelText('Soon up to')).toHaveValue(3);
  });

  it('toggles the clock/date header preference (M3-QA-03)', () => {
    render(<Wrapper />);

    const toggle = screen.getByTestId('show-clock-toggle');
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('overrides a status emoji and reflects it back in the input (M3-QA-03)', () => {
    render(<Wrapper />);

    const input = screen.getByTestId('status-emoji-complete');
    fireEvent.change(input, { target: { value: '🎉' } });
    expect(input).toHaveValue('🎉');
  });

  it('sets closed-task visibility to "days" and exposes the days input (M3-QA-03)', () => {
    render(<Wrapper />);

    expect(screen.queryByTestId('closed-visibility-complete-days')).toBeNull();

    const daysRadio = screen
      .getAllByRole('radio')
      .find(
        (el) =>
          el.getAttribute('name') === 'closed-visibility-complete' &&
          el.nextSibling?.textContent?.trim() === 'days'
      );
    expect(daysRadio).toBeDefined();
    fireEvent.click(daysRadio as Element);

    expect(screen.getByTestId('closed-visibility-complete-days')).toBeInTheDocument();
  });
});
