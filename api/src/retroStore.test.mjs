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
    expect(store.toggleNoteVote(board, 'member', 'n1')).toBe(false);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);
    expect(store.toggleNoteVote(board, 'chair', 'n1')).toBe(true);
    expect(board.notes[0].votes).toHaveLength(2);
  });

  it('toggles a vote off', () => {
    const board = boardWith([note()]);
    store.toggleNoteVote(board, 'other', 'n1');
    store.toggleNoteVote(board, 'other', 'n1');
    expect(board.notes[0].votes).toHaveLength(0);
  });

  it('refuses a stranger', () => {
    const board = boardWith([note()]);
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
    store.setVotingClosed(board, 'chair', true);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(false);
    store.setVotingClosed(board, 'chair', false);
    expect(store.toggleNoteVote(board, 'other', 'n1')).toBe(true);
  });
});

describe('what the board shows a viewer', () => {
  it('reports the count and your own vote, never who voted', () => {
    const board = boardWith([note()]);
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
