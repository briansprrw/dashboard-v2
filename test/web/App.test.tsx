import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app/App';
import { DEFAULT_PREFERENCES } from '../../src/web/state/preferences-schema';
import { makeSheet, makeTask } from './fixtures';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SESSION_USER = {
  id: 'user-1',
  displayName: 'Test Person',
  avatarUrl: null,
  globalRole: 'user',
  locale: 'en-US',
  timezone: 'America/Chicago',
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('App', () => {
  it('renders the logged-out state on a 401 session response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication is required.',
            requestId: 'r1',
          },
        })
      )
    );

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('app-state-logged-out')).toBeInTheDocument());
  });

  it('renders the ready state with sheet data once signed in', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(
          jsonResponse(200, {
            user: {
              id: 'user-1',
              displayName: 'Test Person',
              avatarUrl: null,
              globalRole: 'user',
              locale: 'en-US',
              timezone: 'America/Chicago',
            },
          })
        );
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());
    expect(screen.getByText(sheet.displayName)).toBeInTheDocument();
    expect(screen.getByTestId('task-row')).toBeInTheDocument();
  });

  it('quick-completing a task calls the update endpoint and offers a real Undo', async () => {
    const sheet = makeSheet();
    const task = makeTask({ id: 'task-1', status: 'not_started' });
    let updateCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(
          jsonResponse(200, {
            user: {
              id: 'user-1',
              displayName: 'Test Person',
              avatarUrl: null,
              globalRole: 'user',
              locale: 'en-US',
              timezone: 'America/Chicago',
            },
          })
        );
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      if (url.endsWith('/api/v1/tasks/task-1') && init?.method === 'PUT') {
        updateCallCount += 1;
        const body = JSON.parse(String(init.body)) as { status: string };
        return Promise.resolve(jsonResponse(200, { task: { ...task, status: body.status } }));
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Quick complete'));

    await waitFor(() => expect(updateCallCount).toBe(1));
    expect(await screen.findByTestId('undo-banner')).toHaveTextContent('Task completed.');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(updateCallCount).toBe(2));
  });

  it('renders an error state, distinct from logged-out, on an unexpected session failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: 'INTERNAL', message: 'Something broke.', requestId: 'r1' },
        })
      )
    );

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('app-state-error')).toBeInTheDocument());
    expect(screen.getByText('Something broke.')).toBeInTheDocument();
  });

  it('shows the Offline state and disables mutation controls when the browser goes offline (M0 §8)', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(
          jsonResponse(200, {
            user: {
              id: 'user-1',
              displayName: 'Test Person',
              avatarUrl: null,
              globalRole: 'user',
              locale: 'en-US',
              timezone: 'America/Chicago',
            },
          })
        );
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());
    expect(screen.getByLabelText('Quick complete')).toBeInTheDocument();

    fireEvent(window, new Event('offline'));

    await waitFor(() => expect(screen.getByTestId('app-state-offline')).toBeInTheDocument());
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quick complete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-task-button')).not.toBeInTheDocument();

    fireEvent(window, new Event('online'));
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());
    expect(screen.getByLabelText('Quick complete')).toBeInTheDocument();
  });

  it('glance mode hides the heading and settings chrome by default, reachable via the compact menu (M3-QA-02)', async () => {
    window.localStorage.setItem(
      'dash2.preferences.v1',
      JSON.stringify({ ...DEFAULT_PREFERENCES, mode: 'glance' })
    );
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    expect(screen.queryByRole('heading', { name: 'Dash2' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('display-settings')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('glance-menu-toggle'));
    expect(screen.getByTestId('display-settings')).toBeInTheDocument();

    // The revealed settings panel's own Standard/Glance toggle is glance
    // mode's exit path (product plan: glance "can be exited").
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    expect(screen.getByRole('heading', { name: 'Dash2' })).toBeInTheDocument();
  });

  it('re-entering glance after Menu->Standard starts with the settings panel collapsed again (M3-QA-02 re-review)', async () => {
    window.localStorage.setItem(
      'dash2.preferences.v1',
      JSON.stringify({ ...DEFAULT_PREFERENCES, mode: 'glance' })
    );
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    // Glance -> Menu -> Standard -> Glance.
    fireEvent.click(screen.getByTestId('glance-menu-toggle'));
    expect(screen.getByTestId('display-settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    fireEvent.click(screen.getByTestId('glance-mode-toggle'));

    // Back in Glance: the panel must start collapsed again, not still open
    // from the stale `settingsOpen` state the prior mode cycle left behind.
    expect(screen.queryByTestId('display-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('glance-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('glance mode removes per-row mutation controls but keeps the create affordance (M3-QA-02 re-review)', async () => {
    window.localStorage.setItem(
      'dash2.preferences.v1',
      JSON.stringify({ ...DEFAULT_PREFERENCES, mode: 'glance' })
    );
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    expect(screen.queryByLabelText('Quick complete')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move task')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-row-recycle')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-task-button')).toBeInTheDocument();
  });

  it('shows a prominent clock/date header when the preference is enabled (M3-QA-03)', async () => {
    window.localStorage.setItem(
      'dash2.preferences.v1',
      JSON.stringify({ ...DEFAULT_PREFERENCES, showClock: true })
    );
    const sheet = makeSheet();
    const task = makeTask();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    expect(screen.getByTestId('clock-header')).toBeInTheDocument();
  });

  it('closes an open task dialog and dismisses a pending Undo when the browser goes offline (M3-QA-05)', async () => {
    const sheet = makeSheet();
    const task = makeTask({ id: 'task-1', status: 'not_started' });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      if (url.endsWith('/api/v1/tasks/task-1') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { status: string };
        return Promise.resolve(jsonResponse(200, { task: { ...task, status: body.status } }));
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Edit task'));
    expect(screen.getByTestId('task-form')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Quick complete'));
    expect(await screen.findByTestId('undo-banner')).toBeInTheDocument();

    fireEvent(window, new Event('offline'));

    await waitFor(() => expect(screen.getByTestId('app-state-offline')).toBeInTheDocument());
    expect(screen.queryByTestId('task-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();
  });

  it('surfaces a visible error when a quick-complete request is rejected by the server (M3-QA-04)', async () => {
    const sheet = makeSheet();
    const task = makeTask({ id: 'task-1', status: 'not_started' });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      if (url.endsWith('/api/v1/tasks/task-1') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse(403, {
            error: { code: 'FORBIDDEN', message: 'Not allowed.', requestId: 'r1' },
          })
        );
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Quick complete'));

    expect(await screen.findByTestId('action-error')).toHaveTextContent('Not allowed.');
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();
  });

  it('makes the background dashboard inert while a task dialog is open (M3-QA-09)', async () => {
    const sheet = makeSheet();
    const task = makeTask({ id: 'task-1' });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session'))
        return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Edit task'));
    expect(await screen.findByTestId('task-form')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-section').closest('[inert]')).not.toBeNull();
  });

  it('drops to the logged-out state when a background request receives a 401 (M3-QA-05)', async () => {
    const sheet = makeSheet();
    const task = makeTask();
    let sessionCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session')) {
        sessionCallCount += 1;
        if (sessionCallCount === 1)
          return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
        return Promise.resolve(
          jsonResponse(401, {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication is required.',
              requestId: 'r1',
            },
          })
        );
      }
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(
          jsonResponse(401, {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication is required.',
              requestId: 'r1',
            },
          })
        );
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('app-state-logged-out')).toBeInTheDocument());
  });

  it('drops to the logged-out state when a mutation itself receives a 401 (M3-QA-05 re-review)', async () => {
    const sheet = makeSheet();
    const task = makeTask({ id: 'task-1', status: 'not_started' });
    let sessionCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/session')) {
        sessionCallCount += 1;
        if (sessionCallCount === 1)
          return Promise.resolve(jsonResponse(200, { user: SESSION_USER }));
        return Promise.resolve(
          jsonResponse(401, {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication is required.',
              requestId: 'r1',
            },
          })
        );
      }
      if (url.endsWith('/api/v1/sheets'))
        return Promise.resolve(jsonResponse(200, { sheets: [sheet] }));
      if (url.endsWith(`/api/v1/sheets/${sheet.id}/tasks`))
        return Promise.resolve(jsonResponse(200, { tasks: [task] }));
      if (url.endsWith('/api/v1/tasks/task-1') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse(401, {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication is required.',
              requestId: 'r2',
            },
          })
        );
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-state-ready')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Quick complete'));

    await waitFor(() => expect(screen.getByTestId('app-state-logged-out')).toBeInTheDocument());
  });
});
