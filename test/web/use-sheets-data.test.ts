import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSheetsData } from '../../src/web/hooks/use-sheets-data';
import { makeSheet, makeTask } from './fixtures';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSheetsData', () => {
  it('loads sheets and their tasks into the ready state', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('ready'));
    expect(result.current.data).toMatchObject({
      status: 'ready',
      sheets: [{ sheet, tasks: [task] }],
    });
  });

  it('resolves to empty when the user has no accessible sheets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { sheets: [] })));

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('empty'));
  });

  it('does not fetch while disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(false, 60_000));

    expect(result.current.data.status).toBe('loading');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to stale on a refresh failure, keeping the last successful data', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    let callCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sheets')) {
        callCount += 1;
        if (callCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        return Promise.reject(new TypeError('network down'));
      }
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSheetsData(true, 60_000));
    await waitFor(() => expect(result.current.data.status).toBe('ready'));

    await result.current.refresh();

    await waitFor(() => expect(result.current.data.status).toBe('stale'));
    expect(result.current.data).toMatchObject({
      status: 'stale',
      sheets: [{ sheet, tasks: [task] }],
      message: 'Could not reach the server.',
    });
  });

  it('resolves to error (not stale) when the very first load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const { result } = renderHook(() => useSheetsData(true, 60_000));

    await waitFor(() => expect(result.current.data.status).toBe('error'));
  });

  describe('background polling (M3.5)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls again after the configured interval elapses', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 5_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));
    });

    it('does not start a second request while one is still in flight (no overlap)', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      let resolveSecondCall: (() => void) | undefined;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
          // The second call hangs until the test releases it, simulating a
          // slow in-flight request that must not overlap with a third tick.
          return new Promise<Response>((resolve) => {
            resolveSecondCall = () => resolve(jsonResponse(200, { sheets: [sheet] }));
          });
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // A tick fires while call #2 is still pending; the in-flight guard
      // must skip it rather than starting a third overlapping request.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sheetsCallCount).toBe(2);

      resolveSecondCall?.();
    });

    it('backs off to a longer delay after a failure, and resets after a success', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 2) return Promise.reject(new TypeError('network down'));
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      // Tick 1: the second call fails.
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // The next attempt is backed off to 2x the interval (2000ms): at
      // exactly 1000ms after the failure, no third call has fired yet.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sheetsCallCount).toBe(2);

      // By 2000ms after the failure, the backed-off attempt fires and
      // succeeds, which resets the delay back to the base interval.
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(3));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(4));
    });

    it('coalesces a refresh requested during an in-flight poll instead of dropping it (M3-QA-07)', async () => {
      const sheet = makeSheet();
      const initialTask = makeTask({ name: 'Before' });
      const updatedTask = makeTask({ name: 'After' });
      let sheetsCallCount = 0;
      let resolveSecondCall: (() => void) | undefined;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          if (sheetsCallCount === 1) return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
          if (sheetsCallCount === 2) {
            // The poll's own fetch hangs, simulating a mutation's refresh()
            // call landing while that poll is still in flight.
            return new Promise<Response>((resolve) => {
              resolveSecondCall = () => resolve(jsonResponse(200, { sheets: [sheet] }));
            });
          }
          // The coalesced refresh that must fire once the poll completes
          // picks up the post-mutation server state.
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`)) {
          return Promise.resolve(
            jsonResponse(200, { tasks: [sheetsCallCount <= 2 ? initialTask : updatedTask] })
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useSheetsData(true, 1_000));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(sheetsCallCount).toBe(2));

      // A mutation's post-write refresh() call lands while call #2 (the
      // poll) is still in flight. It must not be silently dropped.
      const coalescedRefresh = result.current.refresh();

      // Releasing the in-flight poll must trigger the coalesced refresh
      // automatically, without waiting for the next timer tick.
      resolveSecondCall?.();
      await coalescedRefresh;

      await vi.waitFor(() => expect(sheetsCallCount).toBe(3));
      await vi.waitFor(() =>
        expect(result.current.data).toMatchObject({
          status: 'ready',
          sheets: [{ sheet, tasks: [updatedTask] }],
        })
      );
    });

    it('does not poll while offline', async () => {
      const sheet = makeSheet();
      const task = makeTask();
      let sheetsCallCount = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/sheets')) {
          sheetsCallCount += 1;
          return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
        }
        if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
          return Promise.resolve(jsonResponse(200, { tasks: [task] }));
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useSheetsData(true, 1_000, false));
      await vi.waitFor(() => expect(sheetsCallCount).toBe(1));

      await vi.advanceTimersByTimeAsync(5_000);
      expect(sheetsCallCount).toBe(1);
    });
  });
});
