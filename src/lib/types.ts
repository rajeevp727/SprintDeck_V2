export type SessionStatus = 'waiting' | 'voting' | 'revealed';

export interface Participant {
  id: string;
  name: string;
  isModerator: boolean;
  hasVoted: boolean;
  vote: string | null; // null unless revealed (or it's your own vote)
}

export interface QueueItem {
  id: string;
  title: string;
  identifier?: string; // Linear key, e.g. ENG-876 (V1 Linear flow)
  linearId?: string; // Linear issue UUID (or "mock-…" placeholder)
  url?: string; // Linear issue URL
  estimate?: number | null; // current estimate on the issue, if any
  status?: string | null; // Linear workflow state (Todo, Blocked, …)
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
  identifier?: string | null; // Linear key when this round is a Linear issue
  linearId?: string | null; // Linear issue UUID
  url?: string | null; // Linear issue URL
  pushedEstimate?: number | null; // estimate written back to Linear, if any
}

export interface CurrentLinear {
  linearId: string;
  identifier: string;
  title: string;
  url: string | null;
}

// A snapshot of the message being replied to, carried on the reply so the quote
// renders even after the original scrolls out of the retained window.
export interface ChatReply {
  id: string;
  name: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  name: string;
  text: string;
  at: number; // epoch ms
  replyTo: ChatReply | null;
  likes: string[]; // participant ids who liked it (length = like count)
}

// Realtime events streamed over the room's Web PubSub group.
export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'like'; messageId: string; likes: string[] };

export interface Session {
  code: string;
  name: string;
  story: string;
  status: SessionStatus;
  finished: boolean;
  currentEntryId: string | null; // history entry of the just-revealed round
  currentLinear: CurrentLinear | null; // the Linear issue being estimated now
  deck: string[];
  moderatorId: string;
  participants: Participant[];
  queue: QueueItem[];
  history: HistoryEntry[];
  average: number | null;
  consensus: boolean;
  chatEnabled: boolean; // shared team chat unlocked (moderator PRO+)
}

export interface JoinResult {
  participantId: string;
  session: Session;
}
