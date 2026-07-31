import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ManageMembersDialog } from '../../src/web/components/sheets/ManageMembersDialog';
import { ApiError } from '../../src/web/lib/api-client';
import { makeSheet } from './fixtures';

const member = {
  sheetId: 'sheet-1',
  userId: 'user-2',
  displayName: 'Jordan',
  role: 'viewer' as const,
  createdAt: 1_800_000_000_000,
};

describe('ManageMembersDialog', () => {
  it('shows the empty message when there are no members', async () => {
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([])}
        lookupUser={vi.fn()}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByTestId('manage-members-empty')).toBeInTheDocument();
  });

  it('identifies a member by display name, not a raw id (M4-QA-04)', async () => {
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([member])}
        lookupUser={vi.fn()}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Jordan')).toBeInTheDocument();
    expect(screen.queryByText(/user-2/)).not.toBeInTheDocument();
  });

  it('falls back to the raw id only if a display name is genuinely unavailable', async () => {
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([{ ...member, displayName: null }])}
        lookupUser={vi.fn()}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('user-2')).toBeInTheDocument();
  });

  it('changes an existing member’s role via the role select, without the email-lookup flow (M4-QA-04)', async () => {
    const onGrant = vi.fn().mockResolvedValue({ ...member, role: 'editor' });
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([member])}
        lookupUser={vi.fn()}
        onGrant={onGrant}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const roleSelect = await screen.findByRole('combobox', { name: 'Role for Jordan' });
    fireEvent.change(roleSelect, { target: { value: 'editor' } });

    await vi.waitFor(() => expect(onGrant).toHaveBeenCalledWith('user-2', 'editor'));
  });

  it('shows a server error on a denied role change', async () => {
    const onGrant = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Owners only.'));
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([member])}
        lookupUser={vi.fn()}
        onGrant={onGrant}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const roleSelect = await screen.findByRole('combobox', { name: 'Role for Jordan' });
    fireEvent.change(roleSelect, { target: { value: 'editor' } });

    expect(await screen.findByText('Owners only.')).toBeInTheDocument();
  });

  it('revokes a member and removes them from the visible list', async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([member])}
        lookupUser={vi.fn()}
        onGrant={vi.fn()}
        onRevoke={onRevoke}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(onRevoke).toHaveBeenCalledWith('user-2'));
    await vi.waitFor(() => expect(screen.getByTestId('manage-members-empty')).toBeInTheDocument());
  });

  it('looks up an email, shows the found name, then grants on explicit confirmation', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Nita' });
    const onGrant = vi.fn().mockResolvedValue({
      sheetId: 'sheet-1',
      userId: 'user-9',
      displayName: 'Nita',
      role: 'viewer',
      createdAt: 0,
    });
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([])}
        lookupUser={lookupUser}
        onGrant={onGrant}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await screen.findByTestId('manage-members-empty');
    fireEvent.change(screen.getByTestId('member-email-input'), {
      target: { value: 'nita@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByTestId('member-lookup-result')).toHaveTextContent('Nita');
    expect(onGrant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add as viewer' }));
    await vi.waitFor(() => expect(onGrant).toHaveBeenCalledWith('user-9', 'viewer'));
  });

  it('grants with the selected role, not always viewer', async () => {
    const lookupUser = vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Nita' });
    const onGrant = vi.fn().mockResolvedValue({
      sheetId: 'sheet-1',
      userId: 'user-9',
      displayName: 'Nita',
      role: 'editor',
      createdAt: 0,
    });
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([])}
        lookupUser={lookupUser}
        onGrant={onGrant}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await screen.findByTestId('manage-members-empty');
    fireEvent.change(screen.getByTestId('member-role-select'), { target: { value: 'editor' } });
    fireEvent.change(screen.getByTestId('member-email-input'), {
      target: { value: 'nita@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Add as editor' }));
    await vi.waitFor(() => expect(onGrant).toHaveBeenCalledWith('user-9', 'editor'));
  });

  it('shows a distinct message for an email with no account (404)', async () => {
    const lookupUser = vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found.'));
    render(
      <ManageMembersDialog
        sheet={makeSheet()}
        loadMembers={vi.fn().mockResolvedValue([])}
        lookupUser={lookupUser}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await screen.findByTestId('manage-members-empty');
    fireEvent.change(screen.getByTestId('member-email-input'), {
      target: { value: 'nobody@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('No account found for that email.')).toBeInTheDocument();
    expect(screen.queryByTestId('member-lookup-result')).not.toBeInTheDocument();
  });
});
