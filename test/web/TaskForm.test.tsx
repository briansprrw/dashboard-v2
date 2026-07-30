import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskForm } from '../../src/web/components/tasks/TaskForm';
import { ApiError } from '../../src/web/lib/api-client';
import { makeTask } from './fixtures';

describe('TaskForm', () => {
  it('rejects submission with an empty name before calling onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A task name is required.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the entered fields when the name is present', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('task-form-name'), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Buy milk' }));
  });

  it('shows a server-side field error returned from onSubmit without crashing', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid fields.', { name: 'Too long.' })
      );
    render(<TaskForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByTestId('task-form-name'), { target: { value: 'x'.repeat(600) } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Too long.')).toBeInTheDocument();
  });

  it('pre-fills fields from an existing task in edit mode and labels the submit button Save', () => {
    const task = makeTask({ name: 'Existing task' });
    render(<TaskForm task={task} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId('task-form-name')).toHaveValue('Existing task');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onCancel without submitting', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<TaskForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('focuses the name field on open and closes on Escape (M3-QA-09)', () => {
    const onCancel = vi.fn();
    render(<TaskForm onSubmit={vi.fn()} onCancel={onCancel} />);

    expect(screen.getByTestId('task-form-name')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
