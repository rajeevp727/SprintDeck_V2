import { request } from './api';
import type { WhiteboardState, WhiteboardJoinResult } from './whiteboardTypes';

export const whiteboardApi = {
  createBoard: (name: string, facilitatorName: string, code: string, roomCode: string, subRef: string) =>
    request<WhiteboardJoinResult>('/api/whiteboard', 'POST', { name, facilitatorName, code, roomCode, subRef }),

  joinBoard: (code: string, name: string) =>
    request<WhiteboardJoinResult>(`/api/whiteboard/${code}/join`, 'POST', { name }),

  getBoard: (code: string, participantId: string) =>
    request<{ whiteboard: WhiteboardState }>(
      `/api/whiteboard/${code}?participantId=${encodeURIComponent(participantId)}`,
      'GET',
    ),

  addElement: (code: string, participantId: string, element: unknown) =>
    request<{ whiteboard: WhiteboardState }>(`/api/whiteboard/${code}/element`, 'POST', {
      participantId,
      element,
    }),

  updateElement: (code: string, participantId: string, elementId: string, patch: unknown) =>
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
};
