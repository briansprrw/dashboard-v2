import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminPanelDialog } from '../../src/web/components/admin/AdminPanelDialog';
import { ApiError } from '../../src/web/lib/api-client';
import type { AdminUserDetailDto } from '../../src/shared/contracts/dto';

function detail(overrides: Partial<AdminUserDetailDto> = {}): AdminUserDetailDto {
  return {
    id: 'user-9',
    displayName: 'Priya',
    globalRole: 'user',
    state: 'active',
    lastSeenAt: null,
    createdAt: 0,
    ownedSheets: [],
    memberships: [],
    ...overrides,
  };
}

function baseProps() {
  return {
    lookupUser: vi.fn().mockResolvedValue({ userId: 'user-9', displayName: 'Priya' }),
    loadUserDetail: vi.fn().mockResolvedValue(detail()),
    onSetGlobalRole: vi.fn().mockResolvedValue(undefined),
    onDisable: vi.fn().mockResolvedValue(undefined),
    onRecycle: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn().mockResolvedValue(undefined),
    onRevokeSessions: vi.fn().mockResolvedValue(undefined),
    onPurge: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };
}

async function lookup(email = 'priya@example.invalid') {
  fireEvent.change(screen.getByTestId('admin-lookup-email-input'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Find' }));
  await screen.findByTestId('admin-user-detail');
}

describe('AdminPanelDialog', () => {
  it('looks up an account and shows its M0 §12 detail', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);

    await lookup();

    const detailNode = screen.getByTestId('admin-user-detail');
    expect(detailNode).toHaveTextContent('Priya');
    expect(detailNode).toHaveTextContent('user, active');
    expect(props.loadUserDetail).toHaveBeenCalledWith('user-9');
  });

  it('shows last activity, and "Never signed in" when it is null (M4-QA-06)', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByTestId('admin-detail-last-seen')).toHaveTextContent('Never signed in');
  });

  it('shows a resolved last-activity timestamp when present', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(detail({ lastSeenAt: 1_800_000_000_000 }));
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByTestId('admin-detail-last-seen')).toHaveTextContent('2027-01-15');
  });

  it('identifies which Lists the account owns, not just a count (M4-QA-06)', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(
      detail({
        ownedSheets: [
          {
            id: 'sheet-1',
            displayName: 'Groceries',
            ownerUserId: 'user-9',
            state: 'active',
            createdAt: 0,
            updatedAt: 0,
            recycledAt: null,
          },
        ],
      })
    );
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByTestId('admin-detail-owned-list')).toHaveTextContent('Groceries');
    expect(screen.queryByTestId('admin-detail-owned-empty')).not.toBeInTheDocument();
  });

  it('shows "None." for owned Lists and memberships when there are none', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByTestId('admin-detail-owned-empty')).toBeInTheDocument();
    expect(screen.getByTestId('admin-detail-memberships-empty')).toBeInTheDocument();
  });

  it('identifies which memberships the account holds, not just a count (M4-QA-06)', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(
      detail({
        memberships: [
          {
            sheetId: 'sheet-2',
            userId: 'user-9',
            displayName: null,
            role: 'editor',
            createdAt: 0,
          },
        ],
      })
    );
    render(<AdminPanelDialog {...props} />);
    await lookup();

    const list = screen.getByTestId('admin-detail-memberships-list');
    expect(list).toHaveTextContent('sheet-2');
    expect(list).toHaveTextContent('editor');
  });

  it('shows a distinct message for an email with no account (404)', async () => {
    const props = baseProps();
    props.lookupUser = vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found.'));
    render(<AdminPanelDialog {...props} />);

    fireEvent.change(screen.getByTestId('admin-lookup-email-input'), {
      target: { value: 'nobody@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('No account found for that email.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-user-detail')).not.toBeInTheDocument();
  });

  it('offers "Make admin" for an active ordinary user, and calls onSetGlobalRole', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Make admin' }));
    await vi.waitFor(() => expect(props.onSetGlobalRole).toHaveBeenCalledWith('user-9', 'admin'));
  });

  it('offers "Remove admin" for an active admin', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(detail({ globalRole: 'admin' }));
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByRole('button', { name: 'Remove admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make admin' })).not.toBeInTheDocument();
  });

  it('disable requires an explicit confirmation naming the account before calling onDisable', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(props.onDisable).not.toHaveBeenCalled();

    const confirmDialog = await screen.findByTestId('admin-confirm-dialog');
    expect(confirmDialog).toHaveTextContent('Priya');

    fireEvent.click(screen.getByRole('button', { name: 'Disable account' }));
    await vi.waitFor(() => expect(props.onDisable).toHaveBeenCalledWith('user-9'));
  });

  it('cancelling the disable confirmation never disables', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await screen.findByTestId('admin-confirm-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('admin-confirm-dialog')).not.toBeInTheDocument();
    expect(props.onDisable).not.toHaveBeenCalled();
  });

  it('recycle requires its own explicit confirmation', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Recycle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recycle account' }));
    await vi.waitFor(() => expect(props.onRecycle).toHaveBeenCalledWith('user-9'));
  });

  it('offers Restore for a disabled account and not Disable/Recycle', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(detail({ state: 'disabled' }));
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recycle' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await vi.waitFor(() => expect(props.onRestore).toHaveBeenCalledWith('user-9'));
  });

  it('offers "Delete forever" only for a recycled account, requiring its own confirmation', async () => {
    const props = baseProps();
    props.loadUserDetail = vi.fn().mockResolvedValue(detail({ state: 'recycled' }));
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    const confirmDialog = await screen.findByTestId('admin-confirm-dialog');
    expect(confirmDialog).toHaveTextContent('cannot be undone');
    expect(props.onPurge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    await vi.waitFor(() => expect(props.onPurge).toHaveBeenCalledWith('user-9'));
  });

  it('a disabled or active account never offers "Delete forever"', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    expect(screen.queryByRole('button', { name: 'Delete forever' })).not.toBeInTheDocument();
  });

  it('"Sign out everywhere" calls onRevokeSessions without a confirmation dialog', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await vi.waitFor(() => expect(props.onRevokeSessions).toHaveBeenCalledWith('user-9'));
  });

  it('shows the server error on a denied action without crashing', async () => {
    const props = baseProps();
    props.onDisable = vi.fn().mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Admins only.'));
    render(<AdminPanelDialog {...props} />);
    await lookup();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Disable account' }));

    expect(await screen.findByText('Admins only.')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const props = baseProps();
    render(<AdminPanelDialog {...props} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
