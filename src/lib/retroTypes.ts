export interface RetroColumn {
  id: string;
  title: string;
  color: string;
}

export interface RetroNote {
  id: string;
  columnId: string;
  authorId: string;
  authorName: string;
  text: string;
  color: string;
  createdAt: number;
  previousColumnId?: string;
  voteCount?: number;
  votedByMe?: boolean;
  /** Written by someone else while the board is hidden: text is withheld. */
  hidden?: boolean;
}

export interface RetroParticipant {
  id: string;
  name: string;
  color: string;
  isFacilitator: boolean;
}

export interface RetroCarryItem {
  id: string;
  text: string;
  done: boolean;
  status?: 'open' | 'in-progress' | 'blocked' | 'done';
  ownerId?: string | null;
  ownerName?: string | null;
  dueDate?: string | null;
  priority?: 'low' | 'medium' | 'high';
  completedAt?: number | null;
  comments?: Array<{ id: string; authorId: string; authorName: string; text: string; at: number }>;
  history?: Array<{ from: string; to: string; changedBy: string; at: number }>;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface RetroBoard {
  notesHidden?: boolean;
  votingClosed?: boolean;
  votingEndsAt?: number | null;
  code: string;
  name: string;
  facilitatorId: string;
  phase: 'review' | 'active' | 'ended';
  carryOverItems: RetroCarryItem[];
  columns: RetroColumn[];
  notes: RetroNote[];
  participants: RetroParticipant[];
}

export interface RetroJoinResult {
  participantId: string;
  board: RetroBoard;
}
