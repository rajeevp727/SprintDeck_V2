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
  linearId?: string; // Linear issue UUID
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
  pushedEstimate?: number | null; // estimate written back to Linear, if any
}

export interface Session {
  code: string;
  name: string;
  story: string;
  status: SessionStatus;
  finished: boolean;
  currentEntryId: string | null; // history entry of the just-revealed round
  deck: string[];
  moderatorId: string;
  participants: Participant[];
  queue: QueueItem[];
  history: HistoryEntry[];
  average: number | null;
  consensus: boolean;
}

export interface JoinResult {
  participantId: string;
  session: Session;
}
