// Closed-task visibility (M0.1 E6, approved): "complete and cancelled are
// separate hide/N-days/always controls." Applied purely on the client from
// `closedAt`, which the DTO already carries — no server change needed, since
// this is a display filter over data the actor can already see, not an
// authorization decision.

import type { TaskDto } from '../../../shared/contracts/dto';
import { isClosedStatus } from '../../../shared/domain/enums';
import type {
  ClosedTaskVisibility,
  ClosedTaskVisibilityPrefs,
} from '../../state/preferences-schema';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isVisible(task: TaskDto, visibility: ClosedTaskVisibility, now: number): boolean {
  if (visibility.mode === 'always') return true;
  if (visibility.mode === 'hide') return false;
  // 'days': visible until `days` whole days after it closed. A closed task
  // with no `closedAt` (should not happen — `closedAt` is derived from
  // status server-side) is kept visible rather than guessed away.
  if (task.closedAt === null) return true;
  return now - task.closedAt <= visibility.days * MS_PER_DAY;
}

/** Open tasks are never filtered here — only `complete`/`cancelled` are subject to this preference. */
export function filterTasksByClosedVisibility(
  tasks: TaskDto[],
  prefs: ClosedTaskVisibilityPrefs,
  now: number = Date.now()
): TaskDto[] {
  return tasks.filter((task) => {
    if (!isClosedStatus(task.status)) return true;
    const visibility = task.status === 'complete' ? prefs.complete : prefs.cancelled;
    return isVisible(task, visibility, now);
  });
}
