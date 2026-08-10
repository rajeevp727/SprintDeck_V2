export type WhiteboardTool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'sticky'
  | 'frame';

export interface WhiteboardElement {
  id: string;
  type: string;
  color: string;
  size?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
  text?: string;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export interface WhiteboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardParticipant {
  id: string;
  name: string;
  isFacilitator: boolean;
  canWrite: boolean;
}

export interface WhiteboardPresence {
  id: string;
  name: string;
  x: number;
  y: number;
  tool: string;
  editingId: string | null;
  isFacilitator: boolean;
}

export interface WhiteboardState {
  code: string;
  name: string;
  facilitatorId: string;
  roomCode: string | null;
  access: 'room' | 'link' | 'open';
  hasShareLink: boolean;
  shareToken: string | null;
  phase: 'active' | 'ended';
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  followPresenter: boolean;
  writers: string[];
  canWrite: boolean;
  isFacilitator: boolean;
  participants: WhiteboardParticipant[];
  presence: WhiteboardPresence[];
}

export interface WhiteboardJoinResult {
  participantId: string;
  whiteboard: WhiteboardState;
}
