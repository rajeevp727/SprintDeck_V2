import { useEffect, useState, type FormEvent } from 'react';
import { whiteboardApi } from '../lib/whiteboardApi';
import { saveIdentity, getIdentity, getCurrentRoom } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { getSubscriptionRef } from '../lib/subscription';
import BrandLogo from './BrandLogo';

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
  const [mode, setMode] = useState<'create' | 'join'>(joinCode || shareToken ? 'join' : 'create');
  const [name, setName] = useState('');
  const [boardName, setBoardName] = useState('');
  const [code, setCode] = useState(joinCode || '');
  const [token, setToken] = useState(shareToken || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roomCode = getCurrentRoom();

  useEffect(() => {
    if (user) setName((n) => n || user.name || user.email.split('@')[0]);
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
        <p className="tagline" style={{ marginTop: '-0.6rem' }}>
          Linked to planning room <strong>{roomCode}</strong> — roommates only unless you share a link.
        </p>
      ) : null}

      <div className="card home-card">
        <div className="tabs">
          <button
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('create');
              setError('');
            }}
          >
            New board
          </button>
          <button
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
          <form onSubmit={handleCreate} className="stack">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" required />
            </label>
            <label>
              Board name
              <input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Sprint planning canvas"
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Creating…' : roomCode ? 'Create room whiteboard' : 'Create shared whiteboard'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="stack">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" required />
            </label>
            <label>
              Board code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCDE"
                required
              />
            </label>
            <label>
              Share token (if invited via link)
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="optional"
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Joining…' : 'Join whiteboard'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
