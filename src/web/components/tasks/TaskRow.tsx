// The stable task-row grammar (M0.1 row E7):
// [status][name][note][emoji flags][due][priority].
//
// Every signal that carries meaning through color also carries a text/icon
// label, so recognition never depends on color alone (AC-G2). Density/zoom
// presentation is driven by CSS custom properties set on an ancestor
// (see global.css); this component itself only renders the grammar and
// accepts the caller's due-band thresholds.
//
// Mutation affordances (M3.4) are opt-in via `actions`: this component never
// calls the API itself, and never decides on its own whether an action is
// allowed — `accessLevel` only controls which buttons render (a UX
// convenience), while the actual authorization decision is always the
// server's (CLAUDE.md: "Server authorization is authoritative. Hidden UI
// controls are not security.").

import { useState } from 'react';

import type { AccessibleSheetDto, TaskDto } from '../../../shared/contracts/dto';
import type { DueThresholds, EmojiOverrides } from '../../state/preferences-schema';
import { computeDueBand, DEFAULT_DUE_THRESHOLDS } from './due-band';
import { PRIORITY_META, STATUS_META } from './task-meta';

function formatDueDate(dueDate: string | null): string {
  if (dueDate === null) return 'TBD';
  const [, month, day] = dueDate.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export interface TaskRowActions {
  accessLevel: AccessibleSheetDto['accessLevel'];
  /**
   * Returns the mutation's promise (M3-QA-04 re-review) so this row can
   * disable itself for the duration and never fire a second overlapping
   * request from a repeated click — the caller (`DashboardView`) still owns
   * error handling and Undo; this component only tracks local pending UI.
   */
  onQuickComplete: (task: TaskDto) => Promise<void>;
  onEdit: (task: TaskDto) => void;
  onMove: (task: TaskDto) => void;
  onRecycle: (task: TaskDto) => Promise<void>;
}

export interface TaskRowProps {
  task: TaskDto;
  now?: Date;
  /** From the caller's device-local preferences (M3.3); falls back to the M3.2 default. */
  dueThresholds?: DueThresholds;
  /** Per-device icon overrides (M3.3/M0.1 E5); an unset key keeps the built-in default. */
  emojiOverrides?: EmojiOverrides;
  actions?: TaskRowActions;
}

export function TaskRow({
  task,
  now,
  dueThresholds = DEFAULT_DUE_THRESHOLDS,
  emojiOverrides,
  actions,
}: TaskRowProps) {
  const status = STATUS_META[task.status];
  const priority = PRIORITY_META[task.priority];
  const statusIcon = emojiOverrides?.status[task.status] ?? status.icon;
  const priorityIcon = emojiOverrides?.priority[task.priority] ?? priority.icon;
  const due = computeDueBand(task, now, dueThresholds);
  const hasNote = task.notes !== null || task.notesRedacted;
  const canWrite = actions
    ? actions.accessLevel === 'owner' || actions.accessLevel === 'editor'
    : false;
  // Tracks quick-complete/recycle in flight for *this* row only, so a
  // repeated click cannot issue a second overlapping request while the
  // first is still pending (M3-QA-04 re-review). Edit/Move only open a
  // dialog — reopening the same dialog kind is not a duplicate mutation, so
  // they are not gated by this.
  const [pendingAction, setPendingAction] = useState<'quickComplete' | 'recycle' | null>(null);

  async function handleQuickComplete() {
    if (!actions || pendingAction !== null) return;
    setPendingAction('quickComplete');
    try {
      await actions.onQuickComplete(task);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRecycle() {
    if (!actions || pendingAction !== null) return;
    setPendingAction('recycle');
    try {
      await actions.onRecycle(task);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <li className="task-row" data-due-band={due.band} data-testid="task-row">
      <span className="task-row__status task-row__icon-badge" title={status.label}>
        <span aria-hidden="true">{statusIcon}</span>
        <span className="task-row__sr-label">{status.label}</span>
      </span>

      {/*
        `title` carries the full name for pointer users because Glance mode
        truncates this with an ellipsis to hold the approved single-line row
        density (`styles/global.css` §10). Assistive tech reads the full text
        from the DOM regardless of the CSS truncation, so nothing is lost
        there; Standard mode wraps instead of truncating.
      */}
      <span className="task-row__name" title={task.name}>
        {task.name}
      </span>

      {/*
        Note/flags/due/priority form one trailing unit rather than four
        independent flex children. At high zoom (or the narrowest two-column
        track) the row has to wrap, and as separate children they shed one
        badge at a time — the priority badge alone on line two, then the due
        pill joining it — which reads as broken rather than reflowed. Grouped,
        the row wraps into two coherent lines: identity, then metadata.
      */}
      <span className="task-row__meta">
        {hasNote && (
          <span
            className="task-row__note"
            title={task.notesRedacted ? 'Private note' : 'Has a note'}
            data-testid="task-row-note"
          >
            <span aria-hidden="true">{task.notesRedacted ? '🔒' : '📝'}</span>
            <span className="task-row__sr-label">
              {task.notesRedacted ? 'Private note' : 'Has a note'}
            </span>
          </span>
        )}

        {task.emojiFlags.length > 0 && (
          <span className="task-row__flags" data-testid="task-row-flags">
            {task.emojiFlags.join(' ')}
          </span>
        )}

        {/*
          The due indicator is a tabular-numeral pill (approved mockup's
          `.task-due`). The mockup shows the date alone and lets the row color
          carry the band; AC-G2 does not allow color to be the sole signal, so
          the band word stays rendered here and is de-emphasized
          typographically instead of dropped (see `styles/global.css` §7).
        */}
        <span className="task-row__due" title={due.label}>
          <span className="task-row__due-date">{formatDueDate(task.dueDate)}</span>
          <span className="task-row__due-label">{due.label}</span>
        </span>

        <span className="task-row__priority task-row__icon-badge" title={priority.label}>
          <span aria-hidden="true">{priorityIcon}</span>
          <span className="task-row__sr-label">{priority.label}</span>
        </span>
      </span>

      {actions && canWrite && (
        <span className="task-row__actions">
          <button
            type="button"
            onClick={() => void handleQuickComplete()}
            aria-label="Quick complete"
            aria-busy={pendingAction === 'quickComplete'}
            disabled={pendingAction !== null}
          >
            ✅
          </button>
          <button
            type="button"
            onClick={() => actions.onEdit(task)}
            aria-label="Edit task"
            disabled={pendingAction !== null}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => actions.onMove(task)}
            aria-label="Move task"
            disabled={pendingAction !== null}
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => void handleRecycle()}
            aria-label="Recycle task"
            aria-busy={pendingAction === 'recycle'}
            disabled={pendingAction !== null}
            data-testid="task-row-recycle"
          >
            Recycle
          </button>
        </span>
      )}
    </li>
  );
}
