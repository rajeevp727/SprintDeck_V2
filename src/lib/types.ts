export type SessionStatus = 'waiting' | 'voting' | 'revealed';

export interface Participant {
  id: string;
  name: string;
  isModerator: boolean;
  hasVoted: boolean;
  vote: string | null; 
}

export interface QueueItem {
  id: string;
  title: string;
  identifier?: string; 
  linearId?: string; 
  url?: string; 
  estimate?: number | null; 
  status?: string | null; 
}

export interface HistoryVote {
  name: string;
  vote: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  consensus: boolean;
  votes: HistoryVote[];
  at: number;
  identifier?: string | null; 
  linearId?: string | null; 
  url?: string | null; 
  pushedEstimate?: number | null; 
}

export interface CurrentLinear {
  linearId: string;
  identifier: string;
  title: string;
  url: string | null;
}

export interface ChatReply {
  id: string;
  name: string;
  excerpt: string;
}

export interface ChatLike {
  id: string;
  name: string;
  at: number; 
}

export interface ChatMessage {
  id: string;
  participantId: string;
  name: string;
  text: string;
  at: number; 
  replyTo: ChatReply | null;
  likes: ChatLike[]; 
}

export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'like'; messageId: string; likes: ChatLike[] };

export interface Session {
  code: string;
  name: string;
  story: string;
  status: SessionStatus;
  finished: boolean;
  currentEntryId: string | null; 
  currentLinear: CurrentLinear | null; 
  deck: string[];
  moderatorId: string;
  participants: Participant[];
  queue: QueueItem[];
  history: HistoryEntry[];
  average: number | null;
  consensus: boolean;
  chatEnabled: boolean; 
  retroCode: string | null; 
}

export interface JoinResult {
  participantId: string;
  session: Session;
}
