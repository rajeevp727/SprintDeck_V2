import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { whiteboardApi } from '../lib/whiteboardApi';
import { saveIdentity, getIdentity, getCurrentRoom } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { getSubscriptionRef, useSubscription } from '../lib/subscription';
import BrandLogo from './BrandLogo';

const SubscriptionModal = lazy(() => import('./SubscriptionModal'));

interface Props {
  onEnter: (code: string) => void;
  onBack: () => void;
  /** Optional share token from URL */
  shareToken?: string;
  /** Pre-filled join code from URL */
  joinCode?: string;
}

export default function WhiteboardStart({ onEnter, onBack, shareToken, joinCode }: Props) {
  const { user } = useAuth();
  const { subscribed, loaded: subLoaded } = useSubscription();
  const [mode, setMode] = useState<'create' | 'join'>(joinCode || shareToken ? 'join' : 'create');
  const [name, setName] = useState('');
  const [boardName, setBoardName] = useState('');
  const [code, setCode] = useState(joinCode || '');
  const [token, setToken] = useState(shareToken || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSubscribe, setShowSubscribe] = useState(false);
  const roomCode = getCurrentRoom();

  const needsPro = subLoaded && !subscribed;
  const createDisabled = busy || needsPro || !name.trim();

  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name?.trim() || user.email.split('@')[0]);
  }, [user]);

  // Auto-resume if we already have identity for this code
  useEffect(() => {
    const c = (joinCode || code).trim().toUpperCase();
    if (!c) return;
    const id = getIdentity(c);
    if (id) onEnter(c);
  }, [joinCode, code, onEnter]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (needsPro) {
      setShowSubscribe(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const roomIdentity = roomCode ? getIdentity(roomCode) : null;
      const res = await whiteboardApi.createBoard({
        name: boardName || 'Team whiteboard',
        facilitatorName: name.trim(),
        roomCode: roomCode || undefined,
        roomParticipantId: roomIdentity?.participantId,
        subRef: getSubscriptionRef() ?? '',
        access: roomCode ? 'room' : 'open',
      });
      saveIdentity(res.whiteboard.code, res.participantId, name.trim());
      onEnter(res.whiteboard.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter a board code');
    setBusy(true);
    setError('');
    try {
      const c = code.trim().toUpperCase();
      const roomIdentity = roomCode ? getIdentity(roomCode) : null;
      const existing = getIdentity(c);
      const res = await whiteboardApi.joinBoard(c, {
        name: name.trim(),
        shareToken: token.trim() || undefined,
        roomCode: roomCode || undefined,
        roomParticipantId: roomIdentity?.participantId,
        participantId: existing?.participantId,
      });
      saveIdentity(res.whiteboard.code, res.participantId, name.trim());
      onEnter(res.whiteboard.code);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <button className="ghost auth-back home-back" onClick={onBack} title="Back" aria-label="Back">
        <span aria-hidden>←</span>
        <span className="auth-back-label">Back</span>
      </button>

      <header className="brand brand-with-logo">
        <BrandLogo />
      </header>
      <p className="tagline">Shared Miro-style whiteboard for your team.</p>
      {roomCode ? (
        <p className="wb-room-note">
          Linked to planning room <strong>{roomCode}</strong> — roommates only unless you share a link.
        </p>
      ) : null}

      <div className="card home-card">
        <div className="tabs">
          <button
            type="button"
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('create');
              setError('');
            }}
          >
            New board
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('join');
              setError('');
            }}
          >
            Join board
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="form">
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                autoFocus
                maxLength={40}
                required
              />
            </label>
            <label>
              Board name <span className="muted">(optional)</span>
              <input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Sprint planning canvas"
                maxLength={60}
              />
            </label>
            {needsPro ? (
              <div className="wb-pro-notice" role="status">
                <p>A Pro subscription is required to start a whiteboard.</p>
                <button type="button" className="ghost wb-upgrade" onClick={() => setShowSubscribe(true)}>
                  View plans →
                </button>
              </div>
            ) : (
              <p className="auth-hint">Hosting a whiteboard needs a Pro subscription.</p>
            )}
            <button className="primary" disabled={createDisabled} type="submit">
              {busy ? 'Creating…' : roomCode ? 'Create room whiteboard' : 'Create shared whiteboard'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="form">
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                autoFocus
                maxLength={40}
                required
              />
            </label>
            <label>
              Board code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="code-input"
                placeholder="ABCDE"
                maxLength={24}
                required
              />
            </label>
            <label>
              Share token <span className="muted">(if invited via link)</span>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" />
            </label>
            <button className="primary" disabled={busy || !name.trim() || !code.trim()} type="submit">
              {busy ? 'Joining…' : 'Join whiteboard'}
            </button>
          </form>
        )}

        {error ? <p className="error">{error}</p> : null}
      </div>

      {showSubscribe ? (
        <Suspense fallback={null}>
          <SubscriptionModal onClose={() => setShowSubscribe(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
