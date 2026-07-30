import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClockHeader } from '../../src/web/components/dashboard/ClockHeader';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClockHeader', () => {
  it('renders a non-empty time and date', () => {
    render(<ClockHeader />);
    const header = screen.getByTestId('clock-header');
    expect(header.textContent).toMatch(/\S/);
  });

  it('updates as the clock ticks', () => {
    render(<ClockHeader />);
    const header = screen.getByTestId('clock-header');
    const before = header.textContent;

    vi.setSystemTime(new Date('2026-07-15T12:05:00Z'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(header.textContent).not.toBe(before);
  });
});
