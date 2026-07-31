// Membership management (M4.2): list current viewers/editors, revoke one, and
// share with another user by their exact email (M4-D2 — no directory/search;
// see UserDirectoryService). The email lookup is a separate explicit step
// before granting, not a single combined call, so the owner sees who they are
// about to add (name, not just an id) before the share takes effect.

import { useEffect, useState, type FormEvent } from 'react';

import type { MembershipDto, SheetDto, UserLookupDto } from '../../../shared/contracts/dto';
import type { MembershipRole } from '../../../shared/domain/enums';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { ApiError } from '../../lib/api-client';

export interface ManageMembersDialogProps {
  sheet: SheetDto;
  loadMembers: () => Promise<MembershipDto[]>;
  lookupUser: (email: string) => Promise<UserLookupDto>;
  onGrant: (userId: string, role: MembershipRole) => Promise<MembershipDto>;
  onRevoke: (userId: string) => Promise<unknown>;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; members: MembershipDto[] }
  | { status: 'error'; message: string };

export function ManageMembersDialog({
  sheet,
  loadMembers,
  lookupUser,
  onGrant,
  onRevoke,
  onClose,
}: ManageMembersDialogProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('viewer');
  const [found, setFound] = useState<UserLookupDto | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useDialogFocus<HTMLDivElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    loadMembers()
      .then((members) => {
        if (!cancelled) setState({ status: 'ready', members });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load members.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [loadMembers]);

  async function handleLookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLookupError(null);
    setFound(null);
    setPending(true);
    try {
      const user = await lookupUser(email);
      setFound(user);
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

  async function handleGrant() {
    if (!found) return;
    setActionError(null);
    setPending(true);
    try {
      const granted = await onGrant(found.userId, role);
      if (state.status === 'ready') {
        setState({
          status: 'ready',
          members: [...state.members.filter((m) => m.userId !== granted.userId), granted],
        });
      }
      setFound(null);
      setEmail('');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not add this member.');
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke(userId: string) {
    setActionError(null);
    setPending(true);
    try {
      await onRevoke(userId);
      if (state.status === 'ready') {
        setState({ status: 'ready', members: state.members.filter((m) => m.userId !== userId) });
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not remove this member.');
    } finally {
      setPending(false);
    }
  }

  /**
   * Changes an existing member's role without going through the email-lookup
   * flow (M4-QA-04) — the server's own grant already upserts idempotently and
   * audits a role change distinctly from a first grant
   * (`sheet.membership.role_changed`, M4-QA-07), so this reuses the same
   * `onGrant` callback rather than needing a separate one.
   */
  async function handleRoleChange(userId: string, newRole: MembershipRole) {
    setActionError(null);
    setPending(true);
    try {
      const updated = await onGrant(userId, newRole);
      if (state.status === 'ready') {
        setState({
          status: 'ready',
          members: state.members.map((m) => (m.userId === userId ? updated : m)),
        });
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not change this member’s role.'
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Manage members of ${sheet.displayName}`}
      data-testid="manage-members-dialog"
      className="dialog"
    >
      <h2 className="dialog__title">Members of "{sheet.displayName}"</h2>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.members.length === 0 && (
        <p data-testid="manage-members-empty">No one else has access yet.</p>
      )}
      {state.status === 'ready' && state.members.length > 0 && (
        <ul className="recycle-bin__list" data-testid="manage-members-list">
          {state.members.map((member) => (
            <li key={member.userId} className="recycle-bin__item">
              <span>{member.displayName ?? member.userId}</span>
              <div className="recycle-bin__item-actions">
                <select
                  value={member.role}
                  aria-label={`Role for ${member.displayName ?? member.userId}`}
                  onChange={(e) =>
                    void handleRoleChange(member.userId, e.target.value as MembershipRole)
                  }
                  disabled={pending}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="button"
                  className="btn--danger"
                  onClick={() => void handleRevoke(member.userId)}
                  disabled={pending}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="field-row" onSubmit={(e) => void handleLookup(e)}>
        <label className="field">
          <span>Add by email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(null);
            }}
            data-testid="member-email-input"
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MembershipRole)}
            data-testid="member-role-select"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <button type="submit" disabled={pending || email.trim().length === 0}>
          Find
        </button>
      </form>

      {lookupError && (
        <p className="field-error" role="alert">
          {lookupError}
        </p>
      )}

      {found && (
        <p data-testid="member-lookup-result">
          Found: {found.displayName}.{' '}
          <button
            type="button"
            className="btn--primary"
            onClick={() => void handleGrant()}
            disabled={pending}
          >
            Add as {role}
          </button>
        </p>
      )}

      {actionError && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
