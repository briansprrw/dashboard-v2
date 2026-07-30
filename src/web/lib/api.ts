// Typed `/api/v1` calls, built on `apiRequest`. This is the single surface
// every data hook uses — no hook or component calls `fetch` or `apiRequest`
// directly, so every task/sheet query and mutation shares one place that
// knows the routes and DTO shapes (M3.1 outcome).

import type {
  AccessibleSheetDto,
  MembershipDto,
  SessionUserDto,
  SheetDto,
  TaskDto,
  TaskEventDto,
} from '../../shared/contracts/dto';
import type {
  CreateSheetRequest,
  MoveTaskRequest,
  TaskFieldsRequest,
} from '../../shared/contracts/requests';
import { apiRequest } from './api-client';

export const api = {
  session: {
    get: () => apiRequest<{ user: SessionUserDto }>('/auth/session'),
    logout: () => apiRequest<{ signedOut: true }>('/auth/logout', { method: 'POST' }),
  },
  sheets: {
    list: () => apiRequest<{ sheets: AccessibleSheetDto[] }>('/sheets'),
    create: (body: CreateSheetRequest) =>
      apiRequest<{ sheet: SheetDto }>('/sheets', { method: 'POST', body }),
    listMembers: (sheetId: string) =>
      apiRequest<{ members: MembershipDto[] }>(`/sheets/${sheetId}/members`),
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
};
