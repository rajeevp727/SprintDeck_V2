import { useState, type FormEvent } from 'react';
import { retroApi } from '../lib/retroApi';
import { saveIdentity } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { getSubscriptionRef } from '../lib/subscription';
import AdBanner from './AdBanner';

interface Props {
  onEnter: (code: string) => void;
  onBack: () => void;
}

// Create or join a retrospective from the dashboard (standalone — carry-over of
// action items only applies to retros started from inside a planning room).
export default function RetroStart({ onEnter, onBack }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState(user?.name || '');
  const [boardName, setBoardName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      const res = await retroApi.createBoard(boardName, name, '', '', getSubscriptionRef() ?? '');
      saveIdentity(res.board.code, res.participantId, name.trim());
      onEnter(res.board.code);
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
      const res = await retroApi.joinBoard(code.trim(), name);
      saveIdentity(res.board.code, res.participantId, name.trim());
      onEnter(res.board.code);
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

      <header className="brand">
        <span className="brand-mark" aria-hidden>🗂️</span>
        <h1>Retrospective</h1>
      </header>
      <p className="tagline">Reflect on the sprint together.</p>

      <div className="card home-card">
        <div className="tabs">
          <button
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('create');
              setError('');
            }}
          >
            New retrospective
          </button>
          <button
            className={mode === 'join' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('join');
              setError('');
            }}
          >
            Join retrospective
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="form">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
            </label>
            <label>
              Board name <span className="muted">(optional)</span>
              <input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder="Sprint {Number} Retrospective" maxLength={60} />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Creating…' : 'Create & host'}
            </button>
            <p className="auth-hint">Hosting a retrospective needs a Pro subscription.</p>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="form">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="UserName" autoFocus maxLength={40} />
            </label>
            <label>
              Board code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="code-input" maxLength={24} />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Joining…' : 'Join retrospective'}
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </div>

      <AdBanner />
    </div>
  );
}
