export type WhiteboardTool = 'pen' | 'rectangle' | 'circle' | 'line' | 'text' | 'sticky' | 'eraser' | 'select';

export interface WhiteboardElement {
  id: string;
  type: WhiteboardTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: { x: number; y: number }[];
  text?: string;
  color: string;
  lineWidth: number;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export interface WhiteboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardState {
  code: string;
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
  updatedAt: number;
}

export interface WhiteboardJoinResult {
  participantId: string;
  whiteboard: WhiteboardState;
}
