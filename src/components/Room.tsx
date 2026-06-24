import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { clearIdentity, getIdentity } from '../storage';
import type { Session } from '../types';
import ResultsModal from './ResultsModal';

const POLL_MS = 1500;

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
}

export default function Room({ code, onLeave, onMissingIdentity }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId ?? '';

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState<string | null>(null);
  const [storyDraft, setStoryDraft] = useState('');
  const [queueDraft, setQueueDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const storyDirty = useRef(false);

  // No identity for this room (e.g. opened an invite link directly) → bounce to join.
  useEffect(() => {
    if (!participantId) onMissingIdentity();
  }, [participantId, onMissingIdentity]);

  const isModerator = session?.moderatorId === participantId;

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const { session: s } = await api.getSession(code, participantId);
      setSession(s);
      setError('');
      // Keep my selected card in sync with what the server has for me.
      const me = s.participants.find((p) => p.id === participantId);
      if (me) setMyVote(me.vote);
      if (!storyDirty.current) setStoryDraft(s.story);
    } catch (err) {
      const msg = (err as Error).message;
      // Session evaporated (cold start / TTL) — drop the stale identity.
      if (msg.includes('not found')) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      setError(msg);
    }
  }, [code, participantId, onMissingIdentity]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function castVote(card: string) {
    if (!session || session.status !== 'voting') return;
    const next = myVote === card ? null : card; // click again to clear
    setMyVote(next); // optimistic
    try {
      const { session: s } = await api.vote(code, participantId, next);
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moderatorAction(fn: () => Promise<{ session: Session }>) {
    try {
      const { session: s } = await fn();
      setSession(s);
      storyDirty.current = false;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addQueue() {
    const titles = queueDraft
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    setQueueDraft('');
    moderatorAction(() => api.addToQueue(code, participantId, titles));
  }

  function leave() {
    clearIdentity(code);
    onLeave();
  }

  async function copyInvite() {
    const url = `${location.origin}/#/room/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  }

  if (!participantId) return null;
  if (!session) {
    return (
      <div className="room-loading">
        {error ? <p className="error">{error}</p> : <p>Loading room…</p>}
      </div>
    );
  }

  const voted = session.participants.filter((p) => p.hasVoted).length;
  const total = session.participants.length;
  const pending = session.participants.filter((p) => !p.hasVoted).map((p) => p.name);

  return (
    <div className="room">
      <header className="room-header">
        <div className="room-meta">
          <span className="room-code" title="Room code">
            {session.code}
          </span>
          <h2>{session.name}</h2>
        </div>
        <div className="room-actions">
          <span className={`status-pill ${session.status}`}>
            {session.status === 'waiting' && 'Not started'}
            {session.status === 'voting' && `Voting · ${voted}/${total}`}
            {session.status === 'revealed' && 'Revealed 🎉'}
          </span>
          <button className="ghost" onClick={() => setShowResults(true)}>
            Results{session.history.length > 0 && <span className="badge">{session.history.length}</span>}
          </button>
          <button className="ghost" onClick={copyInvite}>
            {copied ? 'Copied!' : 'Invite'}
          </button>
          <button className="ghost danger" onClick={leave}>
            Leave
          </button>
        </div>
      </header>

      {session.story && session.status !== 'waiting' && (
        <div className="story-banner">
          <span className="muted">Estimating</span> {session.story}
        </div>
      )}

      <section className="participants">
        {session.participants.map((p) => {
          const showFace = session.status !== 'revealed';
          return (
            <div key={p.id} className={`seat ${p.hasVoted ? 'voted' : ''}`}>
              <div className="seat-name">
                {p.isModerator && <span className="crown" title="Moderator">★</span>}
                {p.name}
                {p.id === participantId && <span className="you"> (you)</span>}
              </div>
              <div className={`seat-card ${p.hasVoted ? 'flipped' : ''}`}>
                {session.status === 'revealed' ? (
                  <span className="seat-value">{p.vote ?? '–'}</span>
                ) : p.hasVoted ? (
                  <span className="seat-back">✓</span>
                ) : (
                  <span className="seat-thinking">{showFace ? '🤔' : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {session.status === 'voting' && pending.length > 0 && pending.length < total && (
        <p className="waiting-on">
          <span className="muted">Waiting on:</span> {pending.join(', ')}
        </p>
      )}

      {session.status === 'revealed' && (
        <div className="result">
          <div className="result-stats">
            <div className="stat">
              <span className="muted">Average</span>
              <strong>{session.average ?? '—'}</strong>
            </div>
            <div className="stat">
              <span className="muted">Median</span>
              <strong>{session.median ?? '—'}</strong>
            </div>
            <div className="stat">
              <span className="muted">Range</span>
              <strong>
                {session.min ?? '—'}–{session.max ?? '—'}
              </strong>
            </div>
          </div>
          {session.consensus ? (
            <div className="consensus">Consensus! 🎯</div>
          ) : (
            session.highVoters.length > 0 && (
              <div className="discuss">
                Discuss: <b>{session.min}</b> ({session.lowVoters.join(', ')}) vs{' '}
                <b>{session.max}</b> ({session.highVoters.join(', ')})
              </div>
            )
          )}
        </div>
      )}

      {/* Moderator controls */}
      {isModerator && (
        <>
          <div className="panel">
            <input
              className="story-input"
              value={storyDraft}
              placeholder="Story name or ticket # (or pull from the queue below)"
              maxLength={120}
              onChange={(e) => {
                storyDirty.current = true;
                setStoryDraft(e.target.value);
              }}
              onBlur={() => {
                if (storyDirty.current && session.status !== 'waiting') {
                  moderatorAction(() => api.setStory(code, participantId, storyDraft));
                }
              }}
            />
            <div className="panel-buttons">
              {session.status === 'waiting' && (
                <button
                  className="primary"
                  onClick={() => moderatorAction(() => api.start(code, participantId, storyDraft))}
                >
                  {storyDraft.trim() ? 'Start voting' : 'Start next story'}
                </button>
              )}
              {session.status === 'voting' && (
                <>
                  <button
                    className="primary"
                    onClick={() => moderatorAction(() => api.reveal(code, participantId))}
                  >
                    Reveal cards
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Clear votes
                  </button>
                </>
              )}
              {session.status === 'revealed' && (
                <>
                  <button
                    className="primary"
                    onClick={() => moderatorAction(() => api.next(code, participantId))}
                  >
                    Save &amp; next
                  </button>
                  <button
                    className="ghost"
                    onClick={() => moderatorAction(() => api.reset(code, participantId))}
                  >
                    Vote again
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Story queue */}
          <div className="queue-panel">
            <div className="queue-head">
              <span className="queue-title">Story queue</span>
              <span className="muted">{session.queue.length} queued</span>
            </div>
            {session.queue.length > 0 && (
              <ul className="queue-list">
                {session.queue.map((q, i) => (
                  <li key={q.id}>
                    <span className="q-num">{i + 1}</span>
                    <span className="q-title">{q.title}</span>
                    <button
                      className="q-remove"
                      title="Remove"
                      onClick={() => moderatorAction(() => api.removeFromQueue(code, participantId, q.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="queue-add">
              <textarea
                value={queueDraft}
                placeholder="Paste stories — one per line — to add to the queue"
                rows={2}
                onChange={(e) => setQueueDraft(e.target.value)}
              />
              <button className="ghost" disabled={!queueDraft.trim()} onClick={addQueue}>
                Add to queue
              </button>
            </div>
          </div>
        </>
      )}

      {!isModerator && session.status === 'waiting' && (
        <p className="wait-msg">Waiting for the moderator to start voting…</p>
      )}

      {/* The deck */}
      <section className={`deck ${session.status === 'voting' ? '' : 'disabled'}`}>
        {session.deck.map((card) => (
          <button
            key={card}
            className={`poker-card ${myVote === card ? 'selected' : ''}`}
            disabled={session.status !== 'voting'}
            onClick={() => castVote(card)}
          >
            <span className="corner tl">{card}</span>
            <span className="face">{card}</span>
            <span className="corner br">{card}</span>
          </button>
        ))}
      </section>

      {error && <p className="error room-error">{error}</p>}

      {showResults && (
        <ResultsModal
          sessionName={session.name}
          history={session.history}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
