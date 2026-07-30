// The approved mockup's collapsible Status / Due / Priority key
// (`docs/mockups/dash2.html` `#legend-container`), added under M3.6-D3 which
// Brian resolved 2026-07-30 as "Legend yes, FAB no".
//
// Purely presentational: it renders the same metadata the rows already use
// (`STATUS_META`, `PRIORITY_META`, the seven due bands) so the key can never
// drift from what is actually on screen. It reads the caller's live emoji
// overrides and due thresholds for the same reason — a Legend that showed the
// built-in defaults while the rows showed a user's overrides would be worse
// than no Legend.
//
// Collapsed by default and held in local component state rather than in
// device preferences: Glance mode's density is a product requirement, so the
// key must cost nothing until asked for, and persisting one boolean is not
// worth widening the preferences schema (explicitly out of the M3.6-D3
// packet).

import { useState } from 'react';

import { TASK_PRIORITIES, TASK_STATUSES } from '../../../shared/domain/enums';
import type { DueThresholds, EmojiOverrides } from '../../state/preferences-schema';
import { DEFAULT_DUE_THRESHOLDS, DUE_BANDS_IN_ORDER, describeDueBand } from '../tasks/due-band';
import { PRIORITY_META, STATUS_META } from '../tasks/task-meta';

export interface LegendProps {
  dueThresholds?: DueThresholds;
  emojiOverrides?: EmojiOverrides;
}

export function Legend({ dueThresholds = DEFAULT_DUE_THRESHOLDS, emojiOverrides }: LegendProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="legend" aria-label="Legend" data-testid="legend">
      <button
        type="button"
        className="legend__toggle"
        aria-expanded={open}
        data-testid="legend-toggle"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="legend__chev" aria-hidden="true">
          ▾
        </span>
        Legend
      </button>

      {open && (
        <div className="legend__body" data-testid="legend-body">
          <div className="legend__row" data-testid="legend-row-status">
            <span className="legend__label">Status</span>
            {TASK_STATUSES.map((status) => (
              <span className="chip" key={status}>
                <span aria-hidden="true">
                  {emojiOverrides?.status[status] ?? STATUS_META[status].icon}
                </span>
                {STATUS_META[status].label}
              </span>
            ))}
          </div>

          <div className="legend__row" data-testid="legend-row-due">
            <span className="legend__label">Due</span>
            {DUE_BANDS_IN_ORDER.map((band) => (
              <span className="legend__band" data-due-band={band} key={band}>
                {describeDueBand(band, dueThresholds)}
              </span>
            ))}
          </div>

          <div className="legend__row" data-testid="legend-row-priority">
            <span className="legend__label">Priority</span>
            {TASK_PRIORITIES.map((priority) => (
              <span className="chip" key={priority}>
                <span aria-hidden="true">
                  {emojiOverrides?.priority[priority] ?? PRIORITY_META[priority].icon}
                </span>
                {PRIORITY_META[priority].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
