// Renders the ready/stale dashboard body: sheet sections, the display
// settings surface, and the M3.4 task-mutation workflows (create/edit/
// quick-complete/move/recycle) with their pending/dialog/Undo states. Split
// out of App.tsx to keep the top-level state switch readable as the ready
// branch grew mutation UI on top of M3.1-M3.3's read-only rendering.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { AdminPanelDialog } from '../components/admin/AdminPanelDialog';
import { ClockHeader } from '../components/dashboard/ClockHeader';
import { Legend } from '../components/dashboard/Legend';
import { DisplaySettings } from '../components/settings/DisplaySettings';
import { CreateSheetDialog } from '../components/sheets/CreateSheetDialog';
import { ManageMembersDialog } from '../components/sheets/ManageMembersDialog';
import { RecycleSheetDialog } from '../components/sheets/RecycleSheetDialog';
import { RenameSheetDialog } from '../components/sheets/RenameSheetDialog';
import { SheetPreferencesDialog } from '../components/sheets/SheetPreferencesDialog';
import { SheetRecycleBinDialog } from '../components/sheets/SheetRecycleBinDialog';
import { SheetSection } from '../components/sheets/SheetSection';
import { TransferOwnershipDialog } from '../components/sheets/TransferOwnershipDialog';
import { MoveTaskDialog } from '../components/tasks/MoveTaskDialog';
import { TaskForm } from '../components/tasks/TaskForm';
import { filterTasksByClosedVisibility } from '../components/tasks/task-visibility';
import { api } from '../lib/api';
import type { UseSheetsDataResult, SheetWithTasks } from '../hooks/use-sheets-data';
import { useUndoableAction } from '../hooks/use-undoable-action';
import type { UsePreferencesResult } from '../state/use-preferences';
import type { UseSheetPreferencesResult } from '../state/use-sheet-preferences';
import type { AccessibleSheetDto, TaskDto } from '../../shared/contracts/dto';
import type { MoveTaskRequest, TaskFieldsRequest } from '../../shared/contracts/requests';

export interface DashboardViewProps {
  /** Already ordered/filtered by the caller's sheet preferences (M4.3). */
  sheets: SheetWithTasks[];
  /** Every accessible sheet, unfiltered — the source list the preferences dialog reorders/hides from. */
  allSheets: AccessibleSheetDto[];
  sheetPreferences: UseSheetPreferencesResult;
  staleMessage?: string;
  prefs: UsePreferencesResult;
  /** While true, no create/edit/move/recycle/quick-complete control renders, and any already-open dialog or pending Undo is closed (M0 §8: "disables edits"; M3-QA-05). */
  offline?: boolean;
  /** Shows the Administration entry point (M4.4). Server-side authorization is what actually gates every action inside it — this only controls whether the affordance renders. */
  isAdmin?: boolean;
  actions: Pick<
    UseSheetsDataResult,
    | 'createSheet'
    | 'createTask'
    | 'updateTask'
    | 'moveTask'
    | 'recycleTask'
    | 'restoreTask'
    | 'renameSheet'
    | 'recycleSheet'
    | 'restoreSheet'
    | 'purgeSheet'
    | 'listRecycledSheets'
    | 'lookupUserByEmail'
    | 'listMembers'
    | 'grantMembership'
    | 'revokeMembership'
    | 'transferOwnership'
  >;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create'; sheetId: string }
  | { kind: 'edit'; task: TaskDto }
  | { kind: 'move'; task: TaskDto }
  | { kind: 'rename-sheet'; sheet: AccessibleSheetDto }
  | { kind: 'recycle-sheet'; sheet: AccessibleSheetDto }
  | { kind: 'sheet-recycle-bin' }
  | { kind: 'manage-members'; sheet: AccessibleSheetDto }
  | { kind: 'transfer-ownership'; sheet: AccessibleSheetDto }
  | { kind: 'sheet-preferences' }
  | { kind: 'admin' }
  | { kind: 'create-sheet' };

function describeActionFailure(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function DashboardView({
  sheets,
  allSheets: allAccessibleSheets,
  sheetPreferences,
  staleMessage,
  prefs,
  offline = false,
  isAdmin = false,
  actions,
}: DashboardViewProps) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [actionError, setActionError] = useState<string | null>(null);
  // Glance mode hides the settings panel by default behind this compact menu
  // affordance (product plan: "Removes navigation chrome... Keeps a compact
  // menu affordance"; M3-QA-02). Standard mode always shows it, unchanged
  // from prior behavior.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    pendingUndo,
    undoPending,
    undoError,
    undo,
    dismiss: dismissUndo,
    offerUndo,
  } = useUndoableAction();
  const { preferences } = prefs;
  const isGlance = preferences.mode === 'glance';

  // M3-QA-02 re-review: `settingsOpen` must not survive a mode change, or a
  // Glance -> Menu -> Standard -> Glance cycle leaves the full panel open on
  // re-entry instead of starting collapsed. Adjusted during render (React's
  // documented pattern for resetting state when a prop/derived value
  // changes: https://react.dev/learn/you-might-not-need-an-effect) rather
  // than in an effect, so the reset is visible in the very same render that
  // detects the mode change.
  const [prevIsGlance, setPrevIsGlance] = useState(isGlance);
  if (isGlance !== prevIsGlance) {
    setPrevIsGlance(isGlance);
    setSettingsOpen(false);
  }

  // Move destinations and the sheet-preferences dialog both need every
  // accessible sheet, not the visibility-filtered `sheets` prop — a hidden
  // sheet must remain a valid move destination and must still appear in the
  // preferences dialog so it can be un-hidden.
  const allSheets = allAccessibleSheets;

  // M3-QA-05: going offline must close an already-open mutation dialog and
  // dismiss (not run) a pending Undo, not just hide the row-level controls
  // that would otherwise let a new one start. Subscribes directly to the
  // browser's own `offline` event (matching `useOnlineStatus`'s pattern)
  // rather than reacting to the already-derived `offline` prop, so the
  // state updates happen inside an external-system callback instead of
  // synchronously in the effect body.
  useEffect(() => {
    function handleOffline() {
      setDialog({ kind: 'none' });
      dismissUndo();
    }
    window.addEventListener('offline', handleOffline);
    return () => window.removeEventListener('offline', handleOffline);
  }, [dismissUndo]);

  async function handleCreate(fields: TaskFieldsRequest) {
    if (dialog.kind !== 'create') return;
    await actions.createTask(dialog.sheetId, fields);
    setDialog({ kind: 'none' });
  }

  async function handleEdit(fields: TaskFieldsRequest) {
    if (dialog.kind !== 'edit') return;
    await actions.updateTask(dialog.task.id, fields);
    setDialog({ kind: 'none' });
  }

  async function handleMove(taskId: string, destinationSheetId: string, confirmed: boolean) {
    const request: MoveTaskRequest = { destinationSheetId, confirmed };
    const task = sheets.flatMap((s) => s.tasks).find((t) => t.id === taskId);
    const originSheetId = task?.sheetId;
    await actions.moveTask(taskId, request);
    if (originSheetId) {
      offerUndo({
        label: 'Task moved.',
        compensate: () =>
          actions.moveTask(taskId, { destinationSheetId: originSheetId, confirmed: true }),
      });
    }
  }

  async function handleQuickComplete(task: TaskDto) {
    const previousStatus = task.status;
    try {
      await actions.updateTask(task.id, {
        name: task.name,
        status: 'complete',
        priority: task.priority,
        dueDate: task.dueDate,
        notes: task.notes,
        isPrivate: task.isPrivate,
        notesPrivate: task.notesPrivate,
        emojiFlagsJson: task.emojiFlags.length > 0 ? JSON.stringify(task.emojiFlags) : null,
      });
    } catch (error) {
      setActionError(describeActionFailure(error));
      return;
    }
    setActionError(null);
    offerUndo({
      label: 'Task completed.',
      compensate: () =>
        actions
          .updateTask(task.id, {
            name: task.name,
            status: previousStatus,
            priority: task.priority,
            dueDate: task.dueDate,
            notes: task.notes,
            isPrivate: task.isPrivate,
            notesPrivate: task.notesPrivate,
            emojiFlagsJson: task.emojiFlags.length > 0 ? JSON.stringify(task.emojiFlags) : null,
          })
          .then(() => undefined),
    });
  }

  async function handleCreateSheet(displayName: string) {
    await actions.createSheet({ displayName });
    setDialog({ kind: 'none' });
  }

  async function handleRenameSheet(displayName: string) {
    if (dialog.kind !== 'rename-sheet') return;
    await actions.renameSheet(dialog.sheet.id, { displayName });
    setDialog({ kind: 'none' });
  }

  async function handleRecycleSheet() {
    if (dialog.kind !== 'recycle-sheet') return;
    await actions.recycleSheet(dialog.sheet.id);
    setDialog({ kind: 'none' });
  }

  async function handleRecycle(task: TaskDto) {
    try {
      await actions.recycleTask(task.id);
    } catch (error) {
      setActionError(describeActionFailure(error));
      return;
    }
    setActionError(null);
    offerUndo({
      label: 'Task recycled.',
      compensate: () => actions.restoreTask(task.id).then(() => undefined),
    });
  }

  // A dialog is modal: the rest of the dashboard must not be reachable by
  // keyboard or assistive tech while one is open (M3-QA-09's "inert
  // background" baseline item), independent of the focus trap the dialog's
  // own `useDialogFocus` call already provides for itself.
  const dialogOpen = dialog.kind !== 'none';

  return (
    <>
      <div className="app__body" inert={dialogOpen}>
        {/*
          One baseline-aligned header row: identity/clock on the left, the
          Glance menu affordance on the right (approved mockup's
          `.glance-header`). Standard mode keeps the app title; Glance mode
          drops it, since a title is exactly the "navigation chrome and
          descriptive labels" that mode removes (product plan).
        */}
        <header className="app__header">
          <div className="app__header-lead">
            {!isGlance && <h1 className="app__title">Dash2</h1>}
            {preferences.showClock && <ClockHeader />}
          </div>
          <div className="app__header-actions">
            {!offline && (
              <button
                type="button"
                className="icon-btn"
                data-testid="create-sheet-open"
                onClick={() => setDialog({ kind: 'create-sheet' })}
              >
                New List
              </button>
            )}
            {!offline && (
              <button
                type="button"
                className="icon-btn"
                data-testid="sheet-order-open"
                onClick={() => setDialog({ kind: 'sheet-preferences' })}
              >
                Sheet order
              </button>
            )}
            {!offline && (
              <button
                type="button"
                className="icon-btn"
                data-testid="sheet-recycle-bin-open"
                onClick={() => setDialog({ kind: 'sheet-recycle-bin' })}
              >
                Recycle bin
              </button>
            )}
            {!offline && isAdmin && (
              <button
                type="button"
                className="icon-btn"
                data-testid="admin-panel-open"
                onClick={() => setDialog({ kind: 'admin' })}
              >
                Admin
              </button>
            )}
            {isGlance && (
              <button
                type="button"
                className="icon-btn"
                aria-expanded={settingsOpen}
                aria-label="Settings menu"
                data-testid="glance-menu-toggle"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <span aria-hidden="true">☰</span>
              </button>
            )}
          </div>
        </header>

        {offline && (
          <p className="banner banner--warn" role="status" data-testid="offline-banner">
            Offline — showing the last data received.
          </p>
        )}

        {staleMessage && (
          <p className="banner banner--warn" role="status">
            Showing the last successful update — {staleMessage}
          </p>
        )}

        {(!isGlance || settingsOpen) && (
          <div className="settings-panel">
            <DisplaySettings prefs={prefs} />
          </div>
        )}

        {actionError && (
          <p className="banner banner--error" role="alert" data-testid="action-error">
            {actionError}
          </p>
        )}

        {pendingUndo && (
          <p className="banner banner--info" role="status" data-testid="undo-banner">
            {pendingUndo.label}{' '}
            <button type="button" className="btn--link" onClick={undo}>
              Undo
            </button>
          </p>
        )}

        {undoPending && (
          <p
            className="banner banner--info"
            role="status"
            aria-busy="true"
            data-testid="undo-pending"
          >
            Undoing…
          </p>
        )}

        {undoError && (
          <p className="banner banner--error" role="alert" data-testid="undo-error">
            {undoError}
          </p>
        )}

        <div
          className="sheet-columns-container"
          style={
            {
              '--column-min': preferences.columnBounds.min,
              '--column-max': preferences.columnBounds.max,
            } as CSSProperties
          }
        >
          <div className="sheet-columns">
            {sheets.map(({ sheet, tasks }) => (
              <SheetSection
                key={sheet.id}
                sheet={sheet}
                tasks={filterTasksByClosedVisibility(tasks, preferences.closedTaskVisibility)}
                dueThresholds={preferences.dueThresholds}
                emojiOverrides={preferences.emojiOverrides}
                collapsed={preferences.collapsedSheetIds.includes(sheet.id)}
                onToggleCollapsed={prefs.toggleSheetCollapsed}
                onCreateTask={
                  offline ? undefined : (sheetId) => setDialog({ kind: 'create', sheetId })
                }
                onRenameSheet={
                  offline ? undefined : () => setDialog({ kind: 'rename-sheet', sheet })
                }
                onRecycleSheet={
                  offline ? undefined : () => setDialog({ kind: 'recycle-sheet', sheet })
                }
                onManageMembers={
                  offline ? undefined : () => setDialog({ kind: 'manage-members', sheet })
                }
                onTransferOwnership={
                  offline ? undefined : () => setDialog({ kind: 'transfer-ownership', sheet })
                }
                // Glance mode removes nonessential controls and keeps only the
                // unobtrusive create affordance above — per-row quick-complete/
                // edit/move/recycle are Standard mode's management surface
                // (product plan: "Standard" is the primary editing experience;
                // Glance's own create affordance is the one exception it names
                // explicitly). M3-QA-02 re-review.
                taskActions={
                  offline || isGlance
                    ? undefined
                    : {
                        onQuickComplete: (task) => handleQuickComplete(task),
                        onEdit: (task) => setDialog({ kind: 'edit', task }),
                        onMove: (task) => setDialog({ kind: 'move', task }),
                        onRecycle: (task) => handleRecycle(task),
                      }
                }
              />
            ))}
          </div>
        </div>

        {/*
          The approved mockup's Status/Due/Priority key, at the foot of the
          dashboard in both modes (M3.6-D3, resolved by Brian 2026-07-30 as
          "Legend yes, FAB no"). Collapsed by default, so it costs no Glance
          density until a user asks for it.
        */}
        <Legend
          dueThresholds={preferences.dueThresholds}
          emojiOverrides={preferences.emojiOverrides}
        />
      </div>

      {dialog.kind === 'create' && (
        <TaskForm onSubmit={handleCreate} onCancel={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'edit' && (
        <TaskForm
          task={dialog.task}
          onSubmit={handleEdit}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'move' && (
        <MoveTaskDialog
          taskId={dialog.task.id}
          candidateSheets={allSheets.filter((s) => s.id !== dialog.task.sheetId)}
          onMove={handleMove}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'rename-sheet' && (
        <RenameSheetDialog
          sheet={dialog.sheet}
          onRename={handleRenameSheet}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'recycle-sheet' && (
        <RecycleSheetDialog
          sheet={dialog.sheet}
          onRecycle={handleRecycleSheet}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'sheet-recycle-bin' && (
        <SheetRecycleBinDialog
          loadRecycled={actions.listRecycledSheets}
          onRestore={actions.restoreSheet}
          onPurge={actions.purgeSheet}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'manage-members' && (
        <ManageMembersDialog
          sheet={dialog.sheet}
          loadMembers={() => actions.listMembers(dialog.sheet.id)}
          lookupUser={actions.lookupUserByEmail}
          onGrant={(userId, role) => actions.grantMembership(dialog.sheet.id, userId, role)}
          onRevoke={(userId) => actions.revokeMembership(dialog.sheet.id, userId)}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'transfer-ownership' && (
        <TransferOwnershipDialog
          sheet={dialog.sheet}
          lookupUser={actions.lookupUserByEmail}
          onTransfer={async (newOwnerUserId) => {
            await actions.transferOwnership(dialog.sheet.id, newOwnerUserId);
            setDialog({ kind: 'none' });
          }}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'sheet-preferences' && (
        <SheetPreferencesDialog
          allSheets={allSheets}
          preferences={sheetPreferences.preferences}
          onSave={sheetPreferences.save}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'admin' && (
        <AdminPanelDialog
          lookupUser={async (email) => (await api.admin.lookupUser({ email })).user}
          loadUserDetail={async (userId) => (await api.admin.getUserDetail(userId)).user}
          onSetGlobalRole={(userId, role) => api.admin.setGlobalRole(userId, role)}
          onDisable={(userId) => api.admin.disableUser(userId)}
          onRecycle={(userId) => api.admin.recycleUser(userId)}
          onRestore={(userId) => api.admin.restoreUser(userId)}
          onRevokeSessions={(userId) => api.admin.revokeUserSessions(userId)}
          onPurge={(userId) => api.admin.purgeUser(userId)}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'create-sheet' && (
        <CreateSheetDialog
          onCreate={handleCreateSheet}
          onCancel={() => setDialog({ kind: 'none' })}
        />
      )}
    </>
  );
}
