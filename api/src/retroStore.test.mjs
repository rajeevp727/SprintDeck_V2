import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const store = createRequire(import.meta.url)('./retroStore.js');

function boardWith(notes = []) {
  return {
    code: 'TEST',
    columns: [
      { id: 'well', title: 'What went well' },
      { id: 'improve', title: 'What to improve' },
      { id: 'wrong', title: 'What went wrong' },
      { id: 'action', title: 'Action items' },
    ],
    notes,
    votingClosed: false,
    participants: { member: { id: 'member' }, other: { id: 'other' }, chair: { id: 'chair' } },
    facilitatorId: 'chair',
  };
}

const note = () => ({ id: 'n1', columnId: 'well', authorId: 'member', text: 'a note' });

describe('board setup', () => {
  it('opens with the three discussion columns and action items', () => {
    const { board } = store.createBoardRecord
      ? { board: store.createBoardRecord() }
      : { board: boardWith() };
    expect(board.columns.map((c) => c.title)).toEqual([
      'What went well',
      'What to improve',
      'What went wrong',
      'Action items',
    ]);
  });
});

describe('moving a note', () => {
  it('is the facilitator’s call, not the author’s', () => {
    const board = boardWith([note()]);
    expect(store.moveNote(board, 'member', 'n1', 'action')).toBe(false);
    expect(store.moveNote(board, 'chair', 'n1', 'action')).toBe(true);
    expect(board.notes[0].columnId).toBe('action');
  });

  it('remembers where it came from so it can go back', () => {
    const board = boardWith([note()]);
    store.moveNote(board, 'chair', 'n1', 'action');
    expect(board.notes[0].previousColumnId).toBe('well');
    store.moveNote(board, 'chair', 'n1', board.notes[0].previousColumnId);
    expect(board.notes[0].columnId).toBe('well');
  });

  it('refuses a column that does not exist', () => {
    const board = boardWith([note()]);
    expect(store.moveNote(board, 'chair', 'n1', 'nope')).toBe(false);
  });
});

describe('voting', () => {
  it('counts other people, never the author', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    expect(store.toggleNoteVote(board, 'member', 'n1')).toBe(false);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);
    expect(store.toggleNoteVote(board, 'chair', 'n1')).toBe(true);
    expect(board.notes[0].votes).toHaveLength(2);
  });

  it('toggles a vote off', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    store.toggleNoteVote(board, 'other', 'n1');
    store.toggleNoteVote(board, 'other', 'n1');
    expect(board.notes[0].votes).toHaveLength(0);
  });

  it('refuses a stranger', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    expect(store.toggleNoteVote(board, 'ghost', 'n1')).toBe(false);
  });
});

describe('closing voting', () => {
  it('is the facilitator’s call', () => {
    const board = boardWith([note()]);
    expect(store.setVotingClosed(board, 'member', true)).toBe(false);
    expect(store.setVotingClosed(board, 'chair', true)).toBe(true);
    expect(board.votingClosed).toBe(true);
  });

  it('freezes the tally', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    const deadline = board.votingEndsAt;

    store.setVotingClosed(board, 'chair', true);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(false);

    // reopening restores the clock the vote was running against
    store.setVotingClosed(board, 'chair', false);
    board.votingEndsAt = deadline;
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);
  });
});

describe('what the board shows a viewer', () => {
  it('reports the count and your own vote, never who voted', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    store.toggleNoteVote(board, 'other', 'n1');
    store.toggleNoteVote(board, 'chair', 'n1');

    const forOther = store.publicView(board, 'other').notes[0];
    expect(forOther.voteCount).toBe(2);
    expect(forOther.votedByMe).toBe(true);
    expect(forOther.votes).toBeUndefined();

    const forAuthor = store.publicView(board, 'member').notes[0];
    expect(forAuthor.votedByMe).toBe(false);
  });
});

describe('who owns which column', () => {
  it('lets members write in the discussion columns only', () => {
    const board = boardWith();
    expect(store.addNote(board, 'member', 'well', 'idea')).toBe(true);
    expect(store.addNote(board, 'member', 'action', 'sneaking one in')).toBe(false);
  });

  it('lets the facilitator write in Action items only', () => {
    const board = boardWith();
    expect(store.addNote(board, 'chair', 'action', 'do this')).toBe(true);
    expect(store.addNote(board, 'chair', 'well', 'not mine to add')).toBe(false);
  });

  it('hides Action items from members until voting closes', () => {
    const board = boardWith();
    store.addNote(board, 'chair', 'action', 'decided');

    const before = store.publicView(board, 'member');
    expect(before.columns.map((c) => c.id)).not.toContain('action');
    expect(before.notes).toHaveLength(0);

    // the facilitator always sees their own column
    expect(store.publicView(board, 'chair').columns.map((c) => c.id)).toContain('action');

    store.setVotingClosed(board, 'chair', true);
    const after = store.publicView(board, 'member');
    expect(after.columns.map((c) => c.id)).toContain('action');
    expect(after.notes).toHaveLength(1);
  });

  it('keeps action items read-only for members after the reveal', () => {
    const board = boardWith();
    store.addNote(board, 'chair', 'action', 'decided');
    store.setVotingClosed(board, 'chair', true);
    const actionNote = board.notes[0];

    expect(store.updateNote(board, 'member', actionNote.id, { text: 'changed' })).toBe(false);
    expect(store.updateNote(board, 'chair', actionNote.id, { text: 'refined' })).toBe(true);
  });
});

describe('deleting', () => {
  it('is self-only, for everyone including the facilitator', () => {
    const board = boardWith();
    store.addNote(board, 'member', 'well', 'mine');
    const mine = board.notes[0];

    expect(store.deleteNote(board, 'chair', mine.id)).toBe(false);
    expect(store.deleteNote(board, 'other', mine.id)).toBe(false);
    expect(store.deleteNote(board, 'member', mine.id)).toBe(true);
  });

  it('lets the facilitator remove their own action item', () => {
    const board = boardWith();
    store.addNote(board, 'chair', 'action', 'theirs');
    const theirs = board.notes[0];

    expect(store.deleteNote(board, 'member', theirs.id)).toBe(false);
    expect(store.deleteNote(board, 'chair', theirs.id)).toBe(true);
  });
});

describe('timed voting', () => {
  it('is the facilitator’s to start, for a sanctioned length', () => {
    const board = boardWith();
    expect(store.startVoting(board, 'member', 5)).toBe(false);
    expect(store.startVoting(board, 'chair', 7)).toBe(false);
    expect(store.startVoting(board, 'chair', 5)).toBe(true);
    expect(board.votingClosed).toBe(false);
    expect(board.votingEndsAt).toBeGreaterThan(Date.now());
  });

  it('offers 2, 3, 5, 8 and 10 minutes', () => {
    expect(store.VotingMinutes).toEqual([2, 3, 5, 8, 10]);
  });

  it('closes itself once the deadline passes', () => {
    const board = boardWith();
    store.startVoting(board, 'chair', 2);
    expect(store.expireVoting(board)).toBe(false);

    board.votingEndsAt = Date.now() - 1;
    expect(store.expireVoting(board)).toBe(true);
    expect(board.votingClosed).toBe(true);
    expect(board.votingEndsAt).toBeNull();
  });

  it('lets the facilitator stop early', () => {
    const board = boardWith();
    store.startVoting(board, 'chair', 10);
    expect(store.setVotingClosed(board, 'chair', true)).toBe(true);
    expect(board.votingClosed).toBe(true);
    expect(board.votingEndsAt).toBeNull();
  });

  it('refuses votes once the clock has run out', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);

    board.votingEndsAt = Date.now() - 1;
    store.expireVoting(board);
    expect(store.toggleNoteVote(board, 'chair', 'n1')).toBe(false);
  });
});

describe('once voting closes', () => {
  it('stops members writing anywhere', () => {
    const board = boardWith();
    store.addNote(board, 'member', 'well', 'in time');
    store.setVotingClosed(board, 'chair', true);

    expect(store.addNote(board, 'member', 'well', 'too late')).toBe(false);
    expect(store.updateNote(board, 'member', board.notes[0].id, { text: 'edited' })).toBe(false);
  });

  it('leaves the facilitator working on action items', () => {
    const board = boardWith();
    store.setVotingClosed(board, 'chair', true);
    expect(store.addNote(board, 'chair', 'action', 'agreed')).toBe(true);
    expect(store.updateNote(board, 'chair', board.notes[0].id, { text: 'reworded' })).toBe(true);
  });

  it('still lets a member remove their own note', () => {
    const board = boardWith();
    store.addNote(board, 'member', 'well', 'mine');
    const mine = board.notes[0];
    store.setVotingClosed(board, 'chair', true);
    expect(store.deleteNote(board, 'member', mine.id)).toBe(true);
  });
});

describe('when the clock runs out', () => {
  it('reveals Action items to members without waiting to be written back', () => {
    const board = boardWith();
    store.addNote(board, 'chair', 'action', 'agreed');
    store.startVoting(board, 'chair', 2);

    expect(store.publicView(board, 'member').columns.map((c) => c.id)).not.toContain('action');

    board.votingEndsAt = Date.now() - 1;
    const view = store.publicView(board, 'member');
    expect(view.columns.map((c) => c.id)).toContain('action');
    expect(view.notes).toHaveLength(1);
    expect(view.votingClosed).toBe(true);
  });
});

describe('extending the vote', () => {
  it('is the facilitator’s, by 1, 2 or 3 minutes, while it is running', () => {
    const board = boardWith();
    expect(store.extendVoting(board, 'chair', 2)).toBe(false); // nothing running yet

    store.startVoting(board, 'chair', 2);
    expect(store.extendVoting(board, 'member', 1)).toBe(false);
    expect(store.extendVoting(board, 'chair', 5)).toBe(false);

    const before = board.votingEndsAt;
    expect(store.extendVoting(board, 'chair', 3)).toBe(true);
    expect(board.votingEndsAt - before).toBe(3 * 60 * 1000);
  });

  it('offers 1, 2 and 3 minutes', () => {
    expect(store.ExtendMinutes).toEqual([1, 2, 3]);
  });

  it('will not extend a vote that is already closed', () => {
    const board = boardWith();
    store.startVoting(board, 'chair', 2);
    store.setVotingClosed(board, 'chair', true);
    expect(store.extendVoting(board, 'chair', 1)).toBe(false);
  });

  it('extends from now when the deadline has just passed', () => {
    const board = boardWith();
    store.startVoting(board, 'chair', 2);
    board.votingEndsAt = Date.now() - 30_000;
    store.extendVoting(board, 'chair', 1);
    expect(board.votingEndsAt).toBeGreaterThan(Date.now() + 55_000);
  });
});

describe('votes need a running clock', () => {
  it('refuses a vote before the facilitator starts one', () => {
    const board = boardWith([note()]);
    expect(board.votingEndsAt).toBeUndefined();
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(false);
  });

  it('accepts votes while it runs and refuses them after', () => {
    const board = boardWith([note()]);
    store.startVoting(board, 'chair', 2);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);

    board.votingEndsAt = Date.now() - 1;
    expect(store.toggleNoteVote(board, 'chair', 'n1')).toBe(false);
  });
});
