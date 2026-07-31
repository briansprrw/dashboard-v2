// Administration and recovery (M4.4): find an account by its exact email
// (same lookup step as sharing/ownership transfer, M4-D2), view its
// M0 §12 detail (account state, global role, last activity, owned Lists,
// memberships — never task/note/history content, since `AdminUserDetailDto`
// has no field that can carry it), and act on it. High-impact actions
// (disable, recycle, purge) each require their own explicit confirmation
// naming the account and the consequence, matching every other destructive
// confirmation in this codebase (RecycleSheetDialog, SheetRecycleBinDialog).

import { useState } from 'react';

import type { AdminUserDetailDto, UserLookupDto } from '../../../shared/contracts/dto';
import type { GlobalRole } from '../../../shared/domain/enums';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface AdminPanelDialogProps {
  lookupUser: (email: string) => Promise<UserLookupDto>;
  loadUserDetail: (userId: string) => Promise<AdminUserDetailDto>;
  onSetGlobalRole: (userId: string, role: GlobalRole) => Promise<unknown>;
  onDisable: (userId: string) => Promise<unknown>;
  onRecycle: (userId: string) => Promise<unknown>;
  onRestore: (userId: string) => Promise<unknown>;
  onRevokeSessions: (userId: string) => Promise<unknown>;
  onPurge: (userId: string) => Promise<unknown>;
  onClose: () => void;
}

type ConfirmKind = 'disable' | 'recycle' | 'purge';

const CONFIRM_COPY: Record<ConfirmKind, { title: string; message: string; confirmLabel: string }> =
  {
    disable: {
      title: 'Disable this account?',
      message:
        'The account is signed out everywhere immediately and cannot sign in again until restored. It keeps owning its Lists.',
      confirmLabel: 'Disable account',
    },
    recycle: {
      title: 'Recycle this account?',
      message:
        'The account is signed out everywhere immediately. Its owned Lists disappear for other members until the account is restored. Recoverable for 30 days.',
      confirmLabel: 'Recycle account',
    },
    purge: {
      title: 'Permanently delete this account?',
      message:
        'This permanently deletes the account and every List it owns, including their tasks and history. This cannot be undone.',
      confirmLabel: 'Delete forever',
    },
  };

export function AdminPanelDialog({
  lookupUser,
  loadUserDetail,
  onSetGlobalRole,
  onDisable,
  onRecycle,
  onRestore,
  onRevokeSessions,
  onPurge,
  onClose,
}: AdminPanelDialogProps) {
  const [email, setEmail] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetailDto | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onClose, confirmKind !== null);

  async function handleLookup() {
    setLookupError(null);
    setDetail(null);
    setPending(true);
    try {
      const found = await lookupUser(email);
      await refreshDetail(found.userId);
    } catch (err) {
      setLookupError(
        err instanceof ApiError && err.status === 404
          ? 'No account found for that email.'
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong looking up that email.'
      );
    } finally {
      setPending(false);
    }
  }

  async function refreshDetail(userId: string) {
    const loaded = await loadUserDetail(userId);
    setDetail(loaded);
  }

  async function runAction(action: () => Promise<unknown>) {
    if (!detail) return;
    setActionError(null);
    setPending(true);
    try {
      await action();
      await refreshDetail(detail.id);
      setConfirmKind(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  async function handlePurgeConfirmed() {
    if (!detail) return;
    setActionError(null);
    setPending(true);
    try {
      await onPurge(detail.id);
      setDetail(null);
      setConfirmKind(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  if (confirmKind && detail) {
    const copy = CONFIRM_COPY[confirmKind];
    return (
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={copy.title}
        data-testid="admin-confirm-dialog"
        className="dialog"
      >
        <h2 className="dialog__title">
          {copy.title} ({detail.displayName})
        </h2>
        <p className="dialog__message">{copy.message}</p>
        {actionError && (
          <p className="field-error" role="alert">
            {actionError}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" onClick={() => setConfirmKind(null)} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn--danger"
            disabled={pending}
            onClick={() =>
              void (confirmKind === 'disable'
                ? runAction(() => onDisable(detail.id))
                : confirmKind === 'recycle'
                  ? runAction(() => onRecycle(detail.id))
                  : handlePurgeConfirmed())
            }
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Administration"
      data-testid="admin-panel-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Administration</h2>

      <div className="field-row">
        <label className="field">
          <span>Account email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setDetail(null);
            }}
            data-testid="admin-lookup-email-input"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleLookup()}
          disabled={pending || email.trim().length === 0}
        >
          Find
        </button>
      </div>

      {lookupError && (
        <p className="field-error" role="alert">
          {lookupError}
        </p>
      )}

      {detail && (
        <div data-testid="admin-user-detail">
          <p>
            <strong>{detail.displayName}</strong> — {detail.globalRole}, {detail.state}
          </p>
          <p data-testid="admin-detail-last-seen">
            Last activity:{' '}
            {detail.lastSeenAt === null
              ? 'Never signed in'
              : new Date(detail.lastSeenAt).toISOString()}
          </p>

          <p>Owned Lists ({detail.ownedSheets.length}):</p>
          {detail.ownedSheets.length === 0 ? (
            <p data-testid="admin-detail-owned-empty">None.</p>
          ) : (
            <ul data-testid="admin-detail-owned-list">
              {detail.ownedSheets.map((sheet) => (
                <li key={sheet.id}>
                  {sheet.displayName} — {sheet.state}
                </li>
              ))}
            </ul>
          )}

          <p>Memberships ({detail.memberships.length}):</p>
          {detail.memberships.length === 0 ? (
            <p data-testid="admin-detail-memberships-empty">None.</p>
          ) : (
            <ul data-testid="admin-detail-memberships-list">
              {detail.memberships.map((membership) => (
                <li key={membership.sheetId}>
                  List {membership.sheetId} — {membership.role}
                </li>
              ))}
            </ul>
          )}

          {actionError && (
            <p className="field-error" role="alert">
              {actionError}
            </p>
          )}

          <div className="dialog__actions">
            {detail.state === 'active' && detail.globalRole === 'user' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void runAction(() => onSetGlobalRole(detail.id, 'admin'))}
              >
                Make admin
              </button>
            )}
            {detail.state === 'active' && detail.globalRole === 'admin' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void runAction(() => onSetGlobalRole(detail.id, 'user'))}
              >
                Remove admin
              </button>
            )}
            {detail.state === 'active' && (
              <button type="button" disabled={pending} onClick={() => setConfirmKind('disable')}>
                Disable
              </button>
            )}
            {detail.state === 'active' && (
              <button type="button" disabled={pending} onClick={() => setConfirmKind('recycle')}>
                Recycle
              </button>
            )}
            {(detail.state === 'disabled' || detail.state === 'recycled') && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void runAction(() => onRestore(detail.id))}
              >
                Restore
              </button>
            )}
            {detail.state === 'recycled' && (
              <button
                type="button"
                className="btn--danger"
                disabled={pending}
                onClick={() => setConfirmKind('purge')}
              >
                Delete forever
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => void runAction(() => onRevokeSessions(detail.id))}
            >
              Sign out everywhere
            </button>
          </div>
        </div>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
