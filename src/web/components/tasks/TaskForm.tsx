// Create/edit task form. Only `name` is required (product plan "Create a
// task" flow: "Require only a task name; all other fields are optional/
// defaulted."). Client-side bounds are hints from the shared `LIMITS`
// constants; the server remains the authoritative validator and its field
// errors (via `ApiError.fields`) are shown inline regardless of what the
// client already checked.

import { useState, type FormEvent } from 'react';

import type { TaskDto } from '../../../shared/contracts/dto';
import type { TaskFieldsRequest } from '../../../shared/contracts/requests';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../../shared/domain/enums';
import { LIMITS } from '../../../shared/domain/limits';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';
import { PRIORITY_META, STATUS_META } from './task-meta';

export interface TaskFormProps {
  /** Present for edit, absent for create. */
  task?: TaskDto;
  onSubmit: (fields: TaskFieldsRequest) => Promise<void>;
  onCancel: () => void;
}

const EMPTY_FIELDS: TaskFieldsRequest = {
  name: '',
  status: 'not_started',
  priority: 'medium',
  dueDate: null,
  notes: null,
  isPrivate: false,
  notesPrivate: false,
  emojiFlagsJson: null,
};

function fromTask(task: TaskDto): TaskFieldsRequest {
  return {
    name: task.name,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    notes: task.notes,
    isPrivate: task.isPrivate,
    notesPrivate: task.notesPrivate,
    emojiFlagsJson: task.emojiFlags.length > 0 ? JSON.stringify(task.emojiFlags) : null,
  };
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const [fields, setFields] = useState<TaskFieldsRequest>(task ? fromTask(task) : EMPTY_FIELDS);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useDialogFocus<HTMLFormElement>(onCancel);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setServerFieldErrors({});

    if (fields.name.trim().length === 0) {
      setNameError('A task name is required.');
      return;
    }
    setNameError(null);

    setPending(true);
    try {
      await onSubmit(fields);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerFieldErrors(err.fields ?? {});
        if (!err.fields) setSubmitError(err.message);
      } else {
        setSubmitError('Something went wrong saving this task.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Edit task' : 'Create task'}
      onSubmit={(e) => void handleSubmit(e)}
      data-testid="task-form"
      className="dialog"
    >
      <h2 className="dialog__title">{task ? 'Edit task' : 'New task'}</h2>

      <label className="field">
        <span>Name</span>
        <input
          value={fields.name}
          maxLength={LIMITS.taskName.max}
          onChange={(e) => setFields({ ...fields, name: e.target.value })}
          data-testid="task-form-name"
        />
      </label>
      {nameError && (
        <p className="field-error" role="alert">
          {nameError}
        </p>
      )}
      {serverFieldErrors.name && (
        <p className="field-error" role="alert">
          {serverFieldErrors.name}
        </p>
      )}

      <div className="field-row">
        <label className="field">
          <span>Status</span>
          <select
            value={fields.status}
            onChange={(e) =>
              setFields({ ...fields, status: e.target.value as TaskFieldsRequest['status'] })
            }
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Priority</span>
          <select
            value={fields.priority}
            onChange={(e) =>
              setFields({ ...fields, priority: e.target.value as TaskFieldsRequest['priority'] })
            }
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_META[priority].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Due date</span>
        <input
          type="date"
          value={fields.dueDate ?? ''}
          onChange={(e) =>
            setFields({ ...fields, dueDate: e.target.value === '' ? null : e.target.value })
          }
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          value={fields.notes ?? ''}
          maxLength={LIMITS.taskNotes.max}
          onChange={(e) =>
            setFields({ ...fields, notes: e.target.value === '' ? null : e.target.value })
          }
        />
      </label>

      <label className="field field--inline">
        <input
          type="checkbox"
          className="switch"
          checked={fields.isPrivate}
          onChange={(e) => setFields({ ...fields, isPrivate: e.target.checked })}
        />
        <span>Private task</span>
      </label>

      <label className="field field--inline">
        <input
          type="checkbox"
          className="switch"
          checked={fields.notesPrivate}
          onChange={(e) => setFields({ ...fields, notesPrivate: e.target.checked })}
        />
        <span>Private note</span>
      </label>

      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn--primary" disabled={pending}>
          {task ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}
