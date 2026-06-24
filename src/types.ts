export type SessionStatus = 'waiting' | 'voting' | 'revealed';

export interface Participant {
  id: string;
  name: string;
  isModerator: boolean;
  hasVoted: boolean;
  vote: string | null; // null unless revealed (or it's your own vote)
}

export interface Session {
  code: string;
  name: string;
  story: string;
  status: SessionStatus;
  deck: string[];
  moderatorId: string;
  participants: Participant[];
  average: number | null;
  consensus: boolean;
}

export interface JoinResult {
  participantId: string;
  session: Session;
}
