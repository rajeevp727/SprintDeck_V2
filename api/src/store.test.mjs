import { describe, it, expect } from 'vitest';
import store from './store.js';

// A minimal in-memory session for exercising the sync domain mutators directly.
function fakeSession() {
  return {
    code: 'ABCDE',
    story: '',
    status: 'waiting',
    finished: false,
    currentEntryId: null,
    currentLinear: null,
    deck: ['1', '2', '3', '5', '8', '13', '21'],
    participants: {
      p1: { id: 'p1', name: 'A', vote: null },
      p2: { id: 'p2', name: 'B', vote: null },
    },
    queue: [],
    history: [],
  };
}

describe('addLinearToQueue', () => {
  it('queues issues with linkage and a plain title', () => {
    const s = fakeSession();
    store.addLinearToQueue(s, [
      { linearId: 'mock-ENG-1', identifier: 'ENG-1', title: 'Do X', url: 'u', estimate: null, status: 'Todo' },
      { identifier: 'no-id-skipped' }, // missing linearId → skipped
    ]);
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0]).toMatchObject({ identifier: 'ENG-1', title: 'Do X', url: 'u', linearId: 'mock-ENG-1' });
  });
});

describe('startStory + revealAndSave', () => {
  it('starts a queued Linear story and stamps it into history on reveal', () => {
    const s = fakeSession();
    store.addLinearToQueue(s, [{ linearId: 'mock-ENG-1', identifier: 'ENG-1', title: 'Do X', url: 'u' }]);
    store.startStory(s);
    expect(s.status).toBe('voting');
    expect(s.story).toBe('Do X');
    expect(s.currentLinear).toMatchObject({ identifier: 'ENG-1' });

    s.participants.p1.vote = '5';
    s.participants.p2.vote = '8';
    store.revealAndSave(s);

    expect(s.status).toBe('revealed');
    expect(s.history).toHaveLength(1);
    const h = s.history[0];
    expect(h.identifier).toBe('ENG-1');
    expect(h.average).toBe(6.5);
    expect(h.median).toBe(6.5);
    expect(h.min).toBe(5);
    expect(h.max).toBe(8);
    expect(h.consensus).toBe(false);
    expect(h.pushedEstimate).toBeNull();
  });

  it('flags consensus when all numeric votes match', () => {
    const s = fakeSession();
    store.startStory(s); // no queue → auto "Iteration 1"
    expect(s.story).toBe('Iteration 1');
    s.participants.p1.vote = '5';
    s.participants.p2.vote = '5';
    store.revealAndSave(s);
    expect(s.history[0].consensus).toBe(true);
    expect(s.history[0].average).toBe(5);
  });
});

describe('markPushed', () => {
  it('records the pushed estimate on the entry', () => {
    const s = fakeSession();
    store.startStory(s);
    s.participants.p1.vote = '3';
    store.revealAndSave(s);
    const ok = store.markPushed(s, s.currentEntryId, 5);
    expect(ok).toBe(true);
    expect(s.history[0].pushedEstimate).toBe(5);
    expect(store.markPushed(s, 'nope', 5)).toBe(false);
  });
});

describe('reorderQueue', () => {
  it('reorders by id and appends any unlisted items', () => {
    const s = fakeSession();
    store.addToQueue(s, ['a', 'b', 'c']);
    const ids = s.queue.map((q) => q.id);
    store.reorderQueue(s, [ids[2], ids[0]]);
    expect(s.queue.map((q) => q.title)).toEqual(['c', 'a', 'b']);
  });
});
