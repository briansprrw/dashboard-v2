// Typed `/api/v1` calls, built on `apiRequest`. This is the single surface
// every data hook uses — no hook or component calls `fetch` or `apiRequest`
// directly, so every task/sheet query and mutation shares one place that
// knows the routes and DTO shapes (M3.1 outcome).

import type {
  AccessibleSheetDto,
  AdminUserDetailDto,
  AuditEventDto,
  MembershipDto,
  SessionUserDto,
  SheetDto,
  SheetPreferencesDto,
  SheetRecoveryDto,
  TaskDto,
  TaskEventDto,
  UserLookupDto,
} from '../../shared/contracts/dto';
import type {
  CreateSheetRequest,
  GrantMembershipRequest,
  LookupUserByEmailRequest,
  MoveTaskRequest,
  RenameSheetRequest,
  TaskFieldsRequest,
  TransferOwnershipRequest,
} from '../../shared/contracts/requests';
import type { GlobalRole } from '../../shared/domain/enums';
import type { SheetPreferences } from '../../shared/domain/sheet-preferences';
import { apiRequest } from './api-client';

export const api = {
  session: {
    get: () => apiRequest<{ user: SessionUserDto }>('/auth/session'),
    logout: () => apiRequest<{ signedOut: true }>('/auth/logout', { method: 'POST' }),
  },
  users: {
    lookup: (body: LookupUserByEmailRequest) =>
      apiRequest<{ user: UserLookupDto }>('/users/lookup', { method: 'POST', body }),
    getSheetPreferences: () =>
      apiRequest<{ preferences: SheetPreferencesDto }>('/users/me/sheet-preferences'),
    saveSheetPreferences: (body: SheetPreferences) =>
      apiRequest<{ preferences: SheetPreferencesDto }>('/users/me/sheet-preferences', {
        method: 'PUT',
        body,
      }),
  },
  sheets: {
    list: () => apiRequest<{ sheets: AccessibleSheetDto[] }>('/sheets'),
    create: (body: CreateSheetRequest) =>
      apiRequest<{ sheet: SheetDto }>('/sheets', { method: 'POST', body }),
    rename: (sheetId: string, body: RenameSheetRequest) =>
      apiRequest<{ sheet: SheetDto }>(`/sheets/${sheetId}`, { method: 'PATCH', body }),
    recycle: (sheetId: string) =>
      apiRequest<{ recycled: true }>(`/sheets/${sheetId}/recycle`, { method: 'POST' }),
    restore: (sheetId: string) =>
      apiRequest<{ restored: true }>(`/sheets/${sheetId}/restore`, { method: 'POST' }),
    purge: (sheetId: string) =>
      apiRequest<{ purged: true }>(`/sheets/${sheetId}`, { method: 'DELETE' }),
    listRecycled: () => apiRequest<{ sheets: SheetDto[] }>('/sheets/recycled'),
    listMembers: (sheetId: string) =>
      apiRequest<{ members: MembershipDto[] }>(`/sheets/${sheetId}/members`),
    grantMembership: (sheetId: string, body: GrantMembershipRequest) =>
      apiRequest<{ membership: MembershipDto }>(`/sheets/${sheetId}/members`, {
        method: 'POST',
        body,
      }),
    revokeMembership: (sheetId: string, userId: string) =>
      apiRequest<{ revoked: true }>(`/sheets/${sheetId}/members/${userId}`, { method: 'DELETE' }),
    transferOwnership: (sheetId: string, body: TransferOwnershipRequest) =>
      apiRequest<{ sheet: SheetDto }>(`/sheets/${sheetId}/ownership`, { method: 'POST', body }),
  },
  tasks: {
    listForSheet: (sheetId: string) => apiRequest<{ tasks: TaskDto[] }>(`/sheets/${sheetId}/tasks`),
    listRecycledForSheet: (sheetId: string) =>
      apiRequest<{ tasks: TaskDto[] }>(`/sheets/${sheetId}/tasks/recycled`),
    create: (sheetId: string, body: TaskFieldsRequest) =>
      apiRequest<{ task: TaskDto }>(`/sheets/${sheetId}/tasks`, { method: 'POST', body }),
    update: (taskId: string, body: TaskFieldsRequest) =>
      apiRequest<{ task: TaskDto }>(`/tasks/${taskId}`, { method: 'PUT', body }),
    move: (taskId: string, body: MoveTaskRequest) =>
      apiRequest<
        { task: TaskDto } | { result: { moved: true; taskId: string; destinationSheetId: string } }
      >(`/tasks/${taskId}/move`, { method: 'POST', body }),
    recycle: (taskId: string) =>
      apiRequest<{ recycled: true }>(`/tasks/${taskId}/recycle`, { method: 'POST' }),
    restore: (taskId: string) =>
      apiRequest<{ task: TaskDto }>(`/tasks/${taskId}/restore`, { method: 'POST' }),
    purge: (taskId: string) =>
      apiRequest<{ purged: true }>(`/tasks/${taskId}`, { method: 'DELETE' }),
    listHistory: (taskId: string) =>
      apiRequest<{ events: TaskEventDto[] }>(`/tasks/${taskId}/history`),
  },
  admin: {
    lookupUser: (body: LookupUserByEmailRequest) =>
      apiRequest<{ user: UserLookupDto }>('/admin/users/lookup', { method: 'POST', body }),
    getUserDetail: (userId: string) =>
      apiRequest<{ user: AdminUserDetailDto }>(`/admin/users/${userId}`),
    setGlobalRole: (userId: string, globalRole: GlobalRole) =>
      apiRequest<{ updated: true }>(`/admin/users/${userId}/role`, {
        method: 'POST',
        body: { globalRole },
      }),
    disableUser: (userId: string) =>
      apiRequest<{ disabled: true }>(`/admin/users/${userId}/disable`, { method: 'POST' }),
    recycleUser: (userId: string) =>
      apiRequest<{ recycled: true }>(`/admin/users/${userId}/recycle`, { method: 'POST' }),
    restoreUser: (userId: string) =>
      apiRequest<{ restored: true }>(`/admin/users/${userId}/restore`, { method: 'POST' }),
    revokeUserSessions: (userId: string) =>
      apiRequest<{ revoked: true }>(`/admin/users/${userId}/revoke-sessions`, { method: 'POST' }),
    purgeUser: (userId: string) =>
      apiRequest<{ purged: true }>(`/admin/users/${userId}`, { method: 'DELETE' }),
    getSheetRecoveryState: (sheetId: string) =>
      apiRequest<{ sheet: SheetRecoveryDto }>(`/admin/sheets/${sheetId}`),
    restoreSheet: (sheetId: string) =>
      apiRequest<{ sheet: SheetRecoveryDto }>(`/admin/sheets/${sheetId}/restore`, {
        method: 'POST',
      }),
    purgeSheet: (sheetId: string) =>
      apiRequest<{ purged: true }>(`/admin/sheets/${sheetId}`, { method: 'DELETE' }),
    /** `before`, when given, continues from a previous response's `nextCursor` (M4-QA-08). */
    listRecentAudit: (limit?: number, before?: { createdAt: number; id: string }) =>
      apiRequest<{ events: AuditEventDto[]; nextCursor: { createdAt: number; id: string } | null }>(
        `/admin/audit${buildAuditQuery(limit, before)}`
      ),
  },
};

function buildAuditQuery(limit?: number, before?: { createdAt: number; id: string }): string {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (before) {
    params.set('beforeCreatedAt', String(before.createdAt));
    params.set('beforeId', before.id);
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}
