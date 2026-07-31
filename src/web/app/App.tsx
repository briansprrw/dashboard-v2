// The application shell: renders the top-level app state derived from the
// session and sheets/tasks data hooks, and applies device-local display
// preferences (mode, zoom, density, theme, collapsed sections, due
// thresholds, column bounds — M3.3) to the ready/stale layout.
//
// The `.app` class on `<main>` is what scopes the design system's tokens
// (`styles/global.css` §1) — every themed value below it is read from there,
// so the pre-preferences states (loading/signed-out/error/empty) render with
// the default Dark token set rather than unstyled.

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { applySheetPreferences } from '../components/sheets/sheet-order';
import { CreateSheetDialog } from '../components/sheets/CreateSheetDialog';
import { useOnlineStatus } from '../hooks/use-online-status';
import { useSheetsData } from '../hooks/use-sheets-data';
import { usePreferences } from '../state/use-preferences';
import { useSession } from '../state/use-session';
import { useSheetPreferences } from '../state/use-sheet-preferences';
import { DashboardView } from './DashboardView';

export function App() {
  const { session, refresh: refreshSession } = useSession();
  const sheetsEnabled = session.status === 'ready';
  const prefs = usePreferences();
  const online = useOnlineStatus();
  const sheetPrefs = useSheetPreferences(sheetsEnabled);
  const [showCreateFromEmpty, setShowCreateFromEmpty] = useState(false);
  const {
    data,
    refresh: refreshData,
    createSheet,
    createTask,
    updateTask,
    moveTask,
    recycleTask,
    restoreTask,
    renameSheet,
    recycleSheet,
    restoreSheet,
    purgeSheet,
    listRecycledSheets,
    lookupUserByEmail,
    listMembers,
    grantMembership,
    revokeMembership,
    transferOwnership,
  } = useSheetsData(
    sheetsEnabled,
    prefs.preferences.refreshIntervalMs,
    online,
    // M3-QA-05: a background 401 (expired/revoked/disabled session) forces a
    // fresh session check instead of being silently treated as ordinary
    // stale data — `refreshSession` re-fetches `/auth/session`, which drops
    // the app to the logged-out state on a real 401.
    refreshSession
  );

  if (session.status === 'loading') {
    return (
      <StateShell testId="app-state-loading">
        <p>Loading…</p>
      </StateShell>
    );
  }

  if (session.status === 'logged-out') {
    return (
      <StateShell testId="app-state-logged-out">
        <p>You are signed out.</p>
        <a className="btn--link" href="/api/v1/auth/start">
          Sign in
        </a>
      </StateShell>
    );
  }

  if (session.status === 'error') {
    return (
      <StateShell testId="app-state-error">
        <p>{session.message}</p>
        <button type="button" onClick={() => void refreshSession()}>
          Retry
        </button>
      </StateShell>
    );
  }

  // session.status === 'ready' from here down.
  if (data.status === 'loading') {
    return (
      <StateShell testId="app-state-loading">
        <p>Loading your Lists…</p>
      </StateShell>
    );
  }

  if (data.status === 'empty') {
    return (
      <StateShell testId="app-state-empty">
        <p>You do not have any Lists yet.</p>
        {!online ? null : showCreateFromEmpty ? (
          <CreateSheetDialog
            onCreate={async (displayName) => {
              await createSheet({ displayName });
              setShowCreateFromEmpty(false);
            }}
            onCancel={() => setShowCreateFromEmpty(false)}
          />
        ) : (
          <button type="button" onClick={() => setShowCreateFromEmpty(true)}>
            New List
          </button>
        )}
      </StateShell>
    );
  }

  if (data.status === 'error') {
    return (
      <StateShell testId="app-state-error">
        <p>{data.message}</p>
        <button type="button" onClick={() => void refreshData()}>
          Retry
        </button>
      </StateShell>
    );
  }

  // data.status === 'ready' | 'stale' from here down.
  const { preferences } = prefs;
  const testId = !online
    ? 'app-state-offline'
    : data.status === 'stale'
      ? 'app-state-stale'
      : 'app-state-ready';
  return (
    <main
      className="app"
      data-testid={testId}
      data-mode={preferences.mode}
      data-theme={preferences.theme}
      data-density={preferences.density}
      style={{ '--zoom-step': preferences.zoom } as CSSProperties}
    >
      {/*
        The dashboard owns its own header (title/clock on the left, the Glance
        menu affordance on the right) rather than receiving it from this
        shell: the two have to share one baseline-aligned row, and the menu
        button's open/closed state lives in `DashboardView`.
      */}
      <DashboardView
        sheets={applySheetPreferences(data.sheets, sheetPrefs.preferences)}
        allSheets={data.sheets.map((s) => s.sheet)}
        sheetPreferences={sheetPrefs}
        staleMessage={online && data.status === 'stale' ? data.message : undefined}
        prefs={prefs}
        offline={!online}
        isAdmin={session.user.globalRole === 'admin'}
        actions={{
          createSheet,
          createTask,
          updateTask,
          moveTask,
          recycleTask,
          restoreTask,
          renameSheet,
          recycleSheet,
          restoreSheet,
          purgeSheet,
          listRecycledSheets,
          lookupUserByEmail,
          listMembers,
          grantMembership,
          revokeMembership,
          transferOwnership,
        }}
      />
    </main>
  );
}

/**
 * Centered single-message shell for the states that render before (or
 * instead of) the dashboard: loading, signed out, empty, and error. These
 * carry no mode/theme attributes because preferences are not what they are
 * waiting on, so they take the design system's default Dark tokens.
 */
function StateShell({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <main className="app" data-testid={testId}>
      <header className="app__header">
        <div className="app__header-lead">
          <h1 className="app__title">Dash2</h1>
        </div>
      </header>
      <div className="app__state">{children}</div>
    </main>
  );
}
