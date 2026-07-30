// Groups one List's tasks under its name. Explicit empty-section messaging
// (rather than an unexplained empty list) is part of M3.2's required
// coverage. Collapse state and due-band thresholds are device-local
// preferences (M3.3) passed down from the caller — this component has no
// storage access of its own. `taskActions`/`onCreateTask` (M3.4) are also
// caller-owned: this component never calls the API directly.

import type { AccessibleSheetDto, TaskDto } from '../../../shared/contracts/dto';
import type { DueThresholds, EmojiOverrides } from '../../state/preferences-schema';
import { sortTasksForDisplay } from '../tasks/task-sort';
import { TaskRow, type TaskRowActions } from '../tasks/TaskRow';

export interface SheetSectionProps {
  sheet: AccessibleSheetDto;
  tasks: TaskDto[];
  now?: Date;
  dueThresholds?: DueThresholds;
  emojiOverrides?: EmojiOverrides;
  collapsed?: boolean;
  onToggleCollapsed?: (sheetId: string) => void;
  taskActions?: Omit<TaskRowActions, 'accessLevel'>;
  onCreateTask?: (sheetId: string) => void;
}

export function SheetSection({
  sheet,
  tasks,
  now,
  dueThresholds,
  emojiOverrides,
  collapsed = false,
  onToggleCollapsed,
  taskActions,
  onCreateTask,
}: SheetSectionProps) {
  const canWrite = sheet.accessLevel === 'owner' || sheet.accessLevel === 'editor';
  const sortedTasks = sortTasksForDisplay(tasks);

  return (
    <section
      className="sheet-section"
      data-testid="sheet-section"
      data-collapsed={collapsed}
      aria-label={sheet.displayName}
    >
      {/*
        The heading is a small dimmed uppercase orientation label, not a
        page-level title (approved mockup's `.section-head`): in Glance mode
        the task bars carry the information and the List name only says which
        area of work they belong to, so it has to recede.

        The chevron is `aria-hidden` and the count sits outside the toggle
        button on purpose — the toggle's accessible name must stay exactly the
        List's display name, and `.sheet-section__name` must be the element
        whose text is exactly that name (both are asserted by
        `test/web/SheetSection.test.tsx`).
      */}
      <h2 className="sheet-section__title">
        {onToggleCollapsed ? (
          <button
            type="button"
            className="sheet-section__collapse-toggle"
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(sheet.id)}
          >
            <span className="sheet-section__chev" aria-hidden="true">
              ▾
            </span>
            <span className="sheet-section__name">{sheet.displayName}</span>
          </button>
        ) : (
          <span className="sheet-section__name">{sheet.displayName}</span>
        )}
        <span className="sheet-section__count">({sortedTasks.length})</span>
        {onCreateTask && canWrite && (
          <button
            type="button"
            className="sheet-section__create"
            onClick={() => onCreateTask(sheet.id)}
            data-testid="create-task-button"
          >
            + Task
          </button>
        )}
      </h2>
      {!collapsed &&
        (sortedTasks.length === 0 ? (
          <p className="sheet-section__empty" data-testid="sheet-section-empty">
            No tasks in this List yet.
          </p>
        ) : (
          <ul className="sheet-section__tasks">
            {sortedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                dueThresholds={dueThresholds}
                emojiOverrides={emojiOverrides}
                actions={
                  taskActions ? { ...taskActions, accessLevel: sheet.accessLevel } : undefined
                }
              />
            ))}
          </ul>
        ))}
    </section>
  );
}
