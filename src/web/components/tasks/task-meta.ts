// Default status/priority icon+label metadata (M0.1 row E5), shared between
// `TaskRow` (which renders it, subject to per-device overrides) and
// `DisplaySettings` (which lets a user override it) — kept out of either
// component file so neither loses Fast Refresh eligibility for exporting a
// plain constant.

import type { TaskPriority, TaskStatus } from '../../../shared/domain/enums';

export const STATUS_META: Record<TaskStatus, { icon: string; label: string }> = {
  not_started: { icon: '🗓️', label: 'Not started' },
  in_progress: { icon: '⏳', label: 'In progress' },
  pending: { icon: '⏰', label: 'Pending' },
  blocked: { icon: '⛔️', label: 'Blocked' },
  complete: { icon: '✅', label: 'Complete' },
  cancelled: { icon: '✖️', label: 'Cancelled' },
};

export const PRIORITY_META: Record<TaskPriority, { icon: string; label: string }> = {
  low: { icon: '💤', label: 'Low priority' },
  medium: { icon: '🟢', label: 'Medium priority' },
  high: { icon: '⚠️', label: 'High priority' },
  urgent: { icon: '☢️', label: 'Urgent priority' },
};
