// The device-local preferences document: mode, zoom, density, theme,
// collapsed sections, due-band thresholds, column bounds, clock/date
// visibility, per-device emoji overrides, and closed-task visibility.
// Deliberately never sent to the server (M0-D9) — `use-preferences.ts` is the
// only place that reads or writes it, via `localStorage`. No task content
// (name, notes) is ever stored here — only these display choices.

import type { TaskPriority, TaskStatus } from '../../shared/domain/enums';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../shared/domain/enums';

export const DISPLAY_MODES = ['standard', 'glance'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const THEMES = ['dark', 'darker', 'light', 'high-contrast'] as const;
export type Theme = (typeof THEMES)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

/** 7 steps, -3..+3, 10% per step (M0 §7). */
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 3;

/** Background refresh: 60s default, bounded 10s-10min (M0 §8, AC-G7). */
export const REFRESH_INTERVAL_DEFAULT_MS = 60_000;
export const REFRESH_INTERVAL_MIN_MS = 10_000;
export const REFRESH_INTERVAL_MAX_MS = 600_000;

export interface DueThresholds {
  soonMaxDays: number;
  soonishMaxDays: number;
}

/**
 * No approved decision fixes a maximum; Brian's decision this session
 * (M3-QA-08) is to pick a reasonable bound rather than leave thresholds
 * unbounded, flagged as sourced-not-formally-decided like the M3.2 day
 * thresholds themselves.
 */
export const DUE_THRESHOLD_MAX_DAYS = 365;

export interface ColumnBounds {
  min: number;
  max: number;
}

/**
 * Per-device semantic icon overrides (M0.1 E5: "Theme-supplied defaults;
 * user-overridable per device"). A missing key falls back to the caller's
 * built-in default (see `TaskRow`'s `STATUS_META`/`PRIORITY_META`) — this
 * document only ever holds the *overrides*, never a full copy of the
 * defaults, so a later default-icon change is not shadowed by a stale stored
 * copy.
 */
export interface EmojiOverrides {
  status: Partial<Record<TaskStatus, string>>;
  priority: Partial<Record<TaskPriority, string>>;
}

/**
 * `hide` — never show a closed task of this status.
 * `days` — show it until `days` whole days after it closed.
 * `always` — show it indefinitely.
 * Complete and cancelled are configured independently (M0.1 E6, approved).
 */
export const CLOSED_TASK_VISIBILITY_MODES = ['hide', 'days', 'always'] as const;
export type ClosedTaskVisibilityMode = (typeof CLOSED_TASK_VISIBILITY_MODES)[number];

export const CLOSED_TASK_DAYS_MIN = 1;
export const CLOSED_TASK_DAYS_MAX = 90;

export interface ClosedTaskVisibility {
  mode: ClosedTaskVisibilityMode;
  /** Only meaningful when `mode === 'days'`; ignored otherwise. */
  days: number;
}

export interface ClosedTaskVisibilityPrefs {
  complete: ClosedTaskVisibility;
  cancelled: ClosedTaskVisibility;
}

export interface Preferences {
  mode: DisplayMode;
  zoom: number;
  density: Density;
  theme: Theme;
  collapsedSheetIds: string[];
  dueThresholds: DueThresholds;
  columnBounds: ColumnBounds;
  refreshIntervalMs: number;
  /** Large configurable date/time header (M0.3 AC-G6, product-plan A5). */
  showClock: boolean;
  emojiOverrides: EmojiOverrides;
  closedTaskVisibility: ClosedTaskVisibilityPrefs;
}

const DEFAULT_CLOSED_TASK_VISIBILITY: ClosedTaskVisibility = { mode: 'always', days: 7 };

export const DEFAULT_PREFERENCES: Preferences = {
  mode: 'standard',
  zoom: 0,
  density: 'comfortable',
  theme: 'dark',
  collapsedSheetIds: [],
  dueThresholds: { soonMaxDays: 3, soonishMaxDays: 7 },
  columnBounds: { min: 1, max: 3 },
  refreshIntervalMs: REFRESH_INTERVAL_DEFAULT_MS,
  showClock: false,
  emojiOverrides: { status: {}, priority: {} },
  closedTaskVisibility: {
    complete: DEFAULT_CLOSED_TASK_VISIBILITY,
    cancelled: DEFAULT_CLOSED_TASK_VISIBILITY,
  },
};

/** Clamps to the 10s-10min bound (M0 §8, AC-G7) rather than rejecting outright. */
export function clampRefreshInterval(ms: number): number {
  return Math.min(REFRESH_INTERVAL_MAX_MS, Math.max(REFRESH_INTERVAL_MIN_MS, Math.round(ms)));
}

/** Column count is bounded to 1-3 (M0-D24); max is firm, min may not exceed max. */
export function clampColumnBounds(bounds: ColumnBounds): ColumnBounds {
  const max = Math.min(3, Math.max(1, Math.round(bounds.max)));
  const min = Math.min(max, Math.max(1, Math.round(bounds.min)));
  return { min, max };
}

/**
 * Ordered, bounded, non-overlapping day thresholds (AC-G2, AC-G6). `soon`
 * must end before `soonish` begins, and both must be positive whole days.
 * Returns `null` for anything invalid so the caller can reject the change
 * and keep the prior valid value rather than silently accepting nonsense.
 */
export function validateDueThresholds(input: unknown): DueThresholds | null {
  if (typeof input !== 'object' || input === null) return null;
  const { soonMaxDays, soonishMaxDays } = input as Record<string, unknown>;
  if (typeof soonMaxDays !== 'number' || typeof soonishMaxDays !== 'number') return null;
  if (!Number.isInteger(soonMaxDays) || !Number.isInteger(soonishMaxDays)) return null;
  if (soonMaxDays < 1 || soonishMaxDays < 1) return null;
  if (soonMaxDays > DUE_THRESHOLD_MAX_DAYS || soonishMaxDays > DUE_THRESHOLD_MAX_DAYS) return null;
  if (soonMaxDays >= soonishMaxDays) return null;
  return { soonMaxDays, soonishMaxDays };
}

/** Clamps to the 1-90 day bound rather than rejecting outright. */
export function clampClosedTaskDays(days: number): number {
  return Math.min(CLOSED_TASK_DAYS_MAX, Math.max(CLOSED_TASK_DAYS_MIN, Math.round(days)));
}

function isClosedTaskVisibilityMode(value: unknown): value is ClosedTaskVisibilityMode {
  return (
    typeof value === 'string' && (CLOSED_TASK_VISIBILITY_MODES as readonly string[]).includes(value)
  );
}

/**
 * Validates one status's closed-task visibility setting. Unlike
 * `validateDueThresholds`, a malformed `days` value does not invalidate an
 * otherwise-valid `mode` — it is simply clamped, since `days` is inert unless
 * `mode === 'days'`.
 */
function sanitizeClosedTaskVisibility(input: unknown): ClosedTaskVisibility {
  if (typeof input !== 'object' || input === null) return DEFAULT_CLOSED_TASK_VISIBILITY;
  const { mode, days } = input as Record<string, unknown>;
  return {
    mode: isClosedTaskVisibilityMode(mode) ? mode : DEFAULT_CLOSED_TASK_VISIBILITY.mode,
    days:
      typeof days === 'number' && Number.isFinite(days)
        ? clampClosedTaskDays(days)
        : DEFAULT_CLOSED_TASK_VISIBILITY.days,
  };
}

function sanitizeClosedTaskVisibilityPrefs(input: unknown): ClosedTaskVisibilityPrefs {
  const candidate =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    complete: sanitizeClosedTaskVisibility(candidate.complete),
    cancelled: sanitizeClosedTaskVisibility(candidate.cancelled),
  };
}

/**
 * Keeps only overrides keyed by a real status/priority with a non-empty
 * string value — an unknown key or an empty override is dropped rather than
 * stored, so a corrupt or stale document cannot resurrect a removed enum
 * value or override an icon with nothing.
 */
function sanitizeEmojiOverrides(input: unknown): EmojiOverrides {
  const candidate =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  function sanitizeMap<K extends string>(
    value: unknown,
    keys: readonly K[]
  ): Partial<Record<K, string>> {
    if (typeof value !== 'object' || value === null) return {};
    const entries = Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [K, string] =>
        (keys as readonly string[]).includes(entry[0]) &&
        typeof entry[1] === 'string' &&
        entry[1].length > 0
    );
    return Object.fromEntries(entries) as Partial<Record<K, string>>;
  }

  return {
    status: sanitizeMap(candidate.status, TASK_STATUSES),
    priority: sanitizeMap(candidate.priority, TASK_PRIORITIES),
  };
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === 'string' && (DISPLAY_MODES as readonly string[]).includes(value);
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function isDensity(value: unknown): value is Density {
  return typeof value === 'string' && (DENSITIES as readonly string[]).includes(value);
}

function isZoom(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= ZOOM_MIN && value <= ZOOM_MAX
  );
}

/**
 * Validates an entire stored/incoming preferences document. Used both to
 * reset corrupt `localStorage` JSON to defaults and to reject an invalid
 * partial update before it is merged and persisted (see `use-preferences.ts`).
 * Every field falls back to its default independently, so one malformed
 * field cannot invalidate the rest of an otherwise-good document.
 */
export function sanitizePreferences(input: unknown): Preferences {
  const candidate =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  const collapsedSheetIds = Array.isArray(candidate.collapsedSheetIds)
    ? candidate.collapsedSheetIds.filter((id): id is string => typeof id === 'string')
    : DEFAULT_PREFERENCES.collapsedSheetIds;

  const dueThresholds =
    validateDueThresholds(candidate.dueThresholds) ?? DEFAULT_PREFERENCES.dueThresholds;

  const columnBounds =
    typeof candidate.columnBounds === 'object' && candidate.columnBounds !== null
      ? clampColumnBounds(candidate.columnBounds as ColumnBounds)
      : DEFAULT_PREFERENCES.columnBounds;

  const refreshIntervalMs =
    typeof candidate.refreshIntervalMs === 'number' && Number.isFinite(candidate.refreshIntervalMs)
      ? clampRefreshInterval(candidate.refreshIntervalMs)
      : DEFAULT_PREFERENCES.refreshIntervalMs;

  return {
    mode: isDisplayMode(candidate.mode) ? candidate.mode : DEFAULT_PREFERENCES.mode,
    zoom: isZoom(candidate.zoom) ? candidate.zoom : DEFAULT_PREFERENCES.zoom,
    density: isDensity(candidate.density) ? candidate.density : DEFAULT_PREFERENCES.density,
    theme: isTheme(candidate.theme) ? candidate.theme : DEFAULT_PREFERENCES.theme,
    collapsedSheetIds,
    dueThresholds,
    columnBounds,
    refreshIntervalMs,
    showClock:
      typeof candidate.showClock === 'boolean'
        ? candidate.showClock
        : DEFAULT_PREFERENCES.showClock,
    emojiOverrides: sanitizeEmojiOverrides(candidate.emojiOverrides),
    closedTaskVisibility: sanitizeClosedTaskVisibilityPrefs(candidate.closedTaskVisibility),
  };
}
