import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { clearIdentity, getIdentity } from '../storage';
import type { Session } from '../types';

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
  const [copied, setCopied] = useState(false);
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

      {session.status === 'revealed' && (
        <div className="result">
          <div className="result-avg">
            <span className="muted">Average</span>
            <strong>{session.average ?? '—'}</strong>
          </div>
          {session.consensus && <div className="consensus">Consensus! 🎯</div>}
        </div>
      )}

      {/* Moderator control panel */}
      {isModerator && (
        <div className="panel">
          <input
            className="story-input"
            value={storyDraft}
            placeholder="Story name or ticket #"
            maxLength={120}
            onChange={(e) => {
              storyDirty.current = true;
              setStoryDraft(e.target.value);
            }}
            onBlur={() => {
              if (storyDirty.current) {
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
                Start voting
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
              <button
                className="primary"
                onClick={() => moderatorAction(() => api.reset(code, participantId))}
              >
                Vote again
              </button>
            )}
          </div>
        </div>
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
    </div>
  );
}
