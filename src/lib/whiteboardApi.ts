import { request } from './api';
import type { WhiteboardState, WhiteboardJoinResult, WhiteboardElement } from './whiteboardTypes';

export const whiteboardApi = {
  createBoard: (payload: {
    name: string;
    facilitatorName: string;
    code?: string;
    roomCode?: string;
    subRef?: string;
    roomParticipantId?: string;
    access?: 'room' | 'link' | 'open';
  }) => request<WhiteboardJoinResult>('/api/whiteboard', 'POST', payload),

  joinBoard: (
    code: string,
    payload: {
      name: string;
      shareToken?: string;
      roomCode?: string;
      roomParticipantId?: string;
      participantId?: string;
    },
  ) => request<WhiteboardJoinResult>(`/api/whiteboard/${code}/join`, 'POST', payload),

  getBoard: (code: string, participantId: string) =>
    request<{ whiteboard: WhiteboardState }>(
      `/api/whiteboard/${code}?participantId=${encodeURIComponent(participantId)}`,
      'GET',
    ),

  addElement: (code: string, participantId: string, element: Partial<WhiteboardElement>) =>
    request<{ element: WhiteboardElement; whiteboard: WhiteboardState }>(
      `/api/whiteboard/${code}/element`,
      'POST',
      { participantId, element },
    ),

  updateElement: (code: string, participantId: string, elementId: string, patch: Partial<WhiteboardElement>) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/element/${elementId}`, 'POST', {
      participantId,
      patch,
    }),

  deleteElement: (code: string, participantId: string, elementId: string) =>
    request<{ whiteboard: WhiteboardState }>(
      `/api/whiteboard/${code}/element/${elementId}?participantId=${encodeURIComponent(participantId)}`,
      'DELETE',
    ),

  clearBoard: (code: string, participantId: string) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/clear`, 'POST', { participantId }),

  endBoard: (code: string, participantId: string) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/end`, 'POST', { participantId }),

  setWriter: (code: string, participantId: string, targetId: string, allow: boolean) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/writers`, 'POST', {
      participantId,
      targetId,
      allow,
    }),

  setShare: (code: string, participantId: string, enable: boolean) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/share`, 'POST', {
      participantId,
      enable,
    }),

  setFollow: (code: string, participantId: string, enabled: boolean) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/follow`, 'POST', {
      participantId,
      enabled,
    }),

  setViewport: (code: string, participantId: string, viewport: { x: number; y: number; zoom: number }) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/viewport`, 'POST', {
      participantId,
      viewport,
    }),

  setPresence: (
    code: string,
    participantId: string,
    patch: { x: number; y: number; tool?: string; editingId?: string | null },
  ) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/presence`, 'POST', {
      participantId,
      ...patch,
    }),

  leave: (code: string, participantId: string) =>
    request<{ ok: boolean }>(`/api/whiteboard/${code}/leave`, 'POST', { participantId }),
};
