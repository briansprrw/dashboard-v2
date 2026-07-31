// Device-local display preferences (M3.3): Standard/Glance mode, zoom,
// density, theme, due-band thresholds, column bounds, refresh interval, clock
// header, icon overrides, and closed-task visibility.
//
// The markup here is deliberately structural: `<fieldset>`/`<legend>` keep the
// grouping semantics and every control stays a real native element (button
// with `aria-pressed`, checkbox, radio, number input) so labels, keyboard
// operation, and the axe scan are unaffected. The design language comes
// entirely from the classes the design system defines — `settings-card`,
// `setting-row`, `segmented`, `switch`, `control-group`, `emoji-grid`
// (`styles/global.css` §4, §5, §12). An earlier version of this component
// carried no classes at all on the theory that "a polished settings surface
// is not required by M3.3's own wording", which is what left Standard mode
// rendering as browser-default fieldsets, radios, and buttons — the single
// largest contributor to Brian's Gate B verdict that the app looked nothing
// like the approved mockup (M3-DEF-11/M3.6-QA-07).

import { useState, type FormEvent } from 'react';

import { TASK_PRIORITIES, TASK_STATUSES } from '../../../shared/domain/enums';
import type { UsePreferencesResult } from '../../state/use-preferences';
import {
  CLOSED_TASK_DAYS_MAX,
  CLOSED_TASK_DAYS_MIN,
  CLOSED_TASK_VISIBILITY_MODES,
  DENSITIES,
  DUE_THRESHOLD_MAX_DAYS,
  REFRESH_INTERVAL_MAX_MS,
  REFRESH_INTERVAL_MIN_MS,
  THEMES,
  ZOOM_MAX,
  ZOOM_MIN,
  type ClosedTaskVisibilityMode,
} from '../../state/preferences-schema';
import { PRIORITY_META, STATUS_META } from '../tasks/task-meta';

export interface DisplaySettingsProps {
  prefs: UsePreferencesResult;
}

export function DisplaySettings({ prefs }: DisplaySettingsProps) {
  const {
    preferences,
    setMode,
    setZoom,
    setDensity,
    setTheme,
    setDueThresholds,
    setColumnBounds,
    setRefreshInterval,
    setShowClock,
    setEmojiOverride,
    setClosedTaskVisibility,
  } = prefs;
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  // Bumped on a rejected submit to remount the uncontrolled threshold inputs
  // back to `preferences.dueThresholds`, so a rejected value never lingers
  // on screen looking saved (M3 AC: "invalid configurations are rejected/
  // reset safely" — rejection alone, with no visible reset, isn't enough).
  const [thresholdsFormKey, setThresholdsFormKey] = useState(0);

  function handleThresholds(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const soonMaxDays = Number(formData.get('soonMaxDays'));
    const soonishMaxDays = Number(formData.get('soonishMaxDays'));
    const accepted = setDueThresholds({ soonMaxDays, soonishMaxDays });
    if (accepted) {
      setThresholdsError(null);
    } else {
      setThresholdsError(
        `Soon and soonish must each be between 1 and ${DUE_THRESHOLD_MAX_DAYS} days, and soon must be less than soonish. Kept the previous thresholds.`
      );
      setThresholdsFormKey((key) => key + 1);
    }
  }

  return (
    <section className="settings" data-testid="display-settings" aria-label="Display settings">
      <div className="settings-card" role="group" aria-labelledby="settings-presentation">
        <h3 className="settings-card__title" id="settings-presentation">
          Presentation
        </h3>

        <div className="setting-row">
          <span className="setting-row__label">Mode</span>
          <div className="setting-row__control">
            <div className="segmented">
              <button
                type="button"
                aria-pressed={preferences.mode === 'standard'}
                onClick={() => setMode('standard')}
              >
                Standard
              </button>
              <button
                type="button"
                aria-pressed={preferences.mode === 'glance'}
                onClick={() => setMode('glance')}
                data-testid="glance-mode-toggle"
              >
                Glance
              </button>
            </div>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-row__label">
            Zoom
            <span className="setting-row__desc">
              {ZOOM_MIN} to +{ZOOM_MAX}, 10% per step
            </span>
          </span>
          <div className="setting-row__control">
            <div className="segmented">
              <button
                type="button"
                aria-label="Decrease zoom"
                onClick={() => setZoom(Math.max(ZOOM_MIN, preferences.zoom - 1))}
              >
                −
              </button>
              <button
                type="button"
                aria-label="Increase zoom"
                onClick={() => setZoom(Math.min(ZOOM_MAX, preferences.zoom + 1))}
              >
                +
              </button>
            </div>
            <span className="chip" data-testid="zoom-value">
              {preferences.zoom}
            </span>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-row__label">Density</span>
          <div className="setting-row__control">
            <div className="segmented">
              {DENSITIES.map((density) => (
                <button
                  key={density}
                  type="button"
                  aria-pressed={preferences.density === density}
                  onClick={() => setDensity(density)}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-row__label">Theme</span>
          <div className="setting-row__control">
            <div className="segmented">
              {THEMES.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={preferences.theme === theme}
                  onClick={() => setTheme(theme)}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* A wrapping <label> rather than a sibling + aria-label, so the whole
            row — not just the 38x22 pill — is a real click/tap target. */}
        <label className="setting-row">
          <span className="setting-row__label">Show clock/date header</span>
          <span className="setting-row__control">
            <input
              type="checkbox"
              className="switch"
              checked={preferences.showClock}
              data-testid="show-clock-toggle"
              onChange={(e) => setShowClock(e.target.checked)}
            />
          </span>
        </label>
      </div>

      <div className="settings-card" role="group" aria-labelledby="settings-layout-refresh">
        <h3 className="settings-card__title" id="settings-layout-refresh">
          Layout &amp; refresh
        </h3>

        <div className="setting-row">
          <span className="setting-row__label">
            Columns
            <span className="setting-row__desc">
              Max is firm. Min is reserved, not yet enforced.
            </span>
          </span>
          <div className="setting-row__control">
            <label>
              Min (not yet enforced)
              <input
                type="number"
                min={1}
                max={3}
                value={preferences.columnBounds.min}
                disabled
                aria-disabled="true"
                onChange={(e) =>
                  setColumnBounds({
                    min: Number(e.target.value),
                    max: preferences.columnBounds.max,
                  })
                }
              />
            </label>
            <label>
              Max
              <input
                type="number"
                min={1}
                max={3}
                value={preferences.columnBounds.max}
                onChange={(e) =>
                  setColumnBounds({
                    min: preferences.columnBounds.min,
                    max: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-row__label">
            Background refresh
            <span className="setting-row__desc">
              {REFRESH_INTERVAL_MIN_MS / 1000}s min · {REFRESH_INTERVAL_MAX_MS / 60000}m max
            </span>
          </span>
          <div className="setting-row__control">
            <label>
              Seconds
              <input
                type="number"
                min={REFRESH_INTERVAL_MIN_MS / 1000}
                max={REFRESH_INTERVAL_MAX_MS / 1000}
                value={preferences.refreshIntervalMs / 1000}
                data-testid="refresh-interval-input"
                onChange={(e) => setRefreshInterval(Number(e.target.value) * 1000)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-card" role="group" aria-labelledby="settings-due-thresholds">
        <h3 className="settings-card__title" id="settings-due-thresholds">
          Due thresholds (days)
        </h3>
        <form
          key={thresholdsFormKey}
          className="settings-form"
          onSubmit={handleThresholds}
          data-testid="due-thresholds-form"
        >
          <label>
            Soon up to
            <input
              type="number"
              name="soonMaxDays"
              min={1}
              max={DUE_THRESHOLD_MAX_DAYS}
              defaultValue={preferences.dueThresholds.soonMaxDays}
            />
          </label>
          <label>
            Soonish up to
            <input
              type="number"
              name="soonishMaxDays"
              min={1}
              max={DUE_THRESHOLD_MAX_DAYS}
              defaultValue={preferences.dueThresholds.soonishMaxDays}
            />
          </label>
          <button type="submit" className="btn--primary">
            Save
          </button>
          {thresholdsError && (
            <p className="settings-error" role="alert">
              {thresholdsError}
            </p>
          )}
        </form>
      </div>

      {(['complete', 'cancelled'] as const).map((status) => (
        <div
          key={status}
          className="settings-card"
          role="group"
          aria-labelledby={`settings-closed-visibility-${status}`}
        >
          <h3 className="settings-card__title" id={`settings-closed-visibility-${status}`}>
            {status === 'complete' ? 'Completed' : 'Cancelled'} task visibility
          </h3>
          <div className="control-group">
            {CLOSED_TASK_VISIBILITY_MODES.map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name={`closed-visibility-${status}`}
                  checked={preferences.closedTaskVisibility[status].mode === mode}
                  onChange={() =>
                    setClosedTaskVisibility(status, {
                      ...preferences.closedTaskVisibility[status],
                      mode: mode as ClosedTaskVisibilityMode,
                    })
                  }
                />
                {mode}
              </label>
            ))}
            {preferences.closedTaskVisibility[status].mode === 'days' && (
              <label>
                Days
                <input
                  type="number"
                  min={CLOSED_TASK_DAYS_MIN}
                  max={CLOSED_TASK_DAYS_MAX}
                  data-testid={`closed-visibility-${status}-days`}
                  value={preferences.closedTaskVisibility[status].days}
                  onChange={(e) =>
                    setClosedTaskVisibility(status, {
                      ...preferences.closedTaskVisibility[status],
                      days: Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
          </div>
        </div>
      ))}

      <div className="settings-card" role="group" aria-labelledby="settings-status-icons">
        <h3 className="settings-card__title" id="settings-status-icons">
          Status icons
        </h3>
        <div className="emoji-grid">
          {TASK_STATUSES.map((status) => (
            <label key={status}>
              {STATUS_META[status].label}
              <input
                type="text"
                maxLength={4}
                data-testid={`status-emoji-${status}`}
                value={preferences.emojiOverrides.status[status] ?? STATUS_META[status].icon}
                onChange={(e) => setEmojiOverride('status', status, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="settings-card" role="group" aria-labelledby="settings-priority-icons">
        <h3 className="settings-card__title" id="settings-priority-icons">
          Priority icons
        </h3>
        <div className="emoji-grid">
          {TASK_PRIORITIES.map((priority) => (
            <label key={priority}>
              {PRIORITY_META[priority].label}
              <input
                type="text"
                maxLength={4}
                data-testid={`priority-emoji-${priority}`}
                value={
                  preferences.emojiOverrides.priority[priority] ?? PRIORITY_META[priority].icon
                }
                onChange={(e) => setEmojiOverride('priority', priority, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
