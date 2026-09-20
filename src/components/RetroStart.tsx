import { useEffect, useRef, useState, type FormEvent } from 'react';
import { retroApi } from '../lib/retroApi';
import { saveIdentity, getIdentity } from '../lib/storage';
import { useSubscription } from '../lib/subscription';
import { useProfileNamePrefill } from '../lib/useProfileName';
import { useAuth } from '../lib/auth';
import AdBanner from './AdBanner';

interface Props {
  onEnter: (code: string) => void;
  onBack: () => void;
}

export default function RetroStart({ onEnter, onBack }: Props) {
  const { user } = useAuth();
  const { subscription, loaded: planLoaded } = useSubscription();
  const canHost = !!subscription;
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useProfileNamePrefill();
  const [boardName, setBoardName] = useState('');
  const [code, setCode] = useState('');
  // Rejoining a board keeps the name that board already knows you by.
  const priorName = code.trim() ? getIdentity(code.trim().toUpperCase())?.name || '' : '';
  const joinName = priorName || name;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const autoHosted = useRef(false);

  useEffect(() => {
    if (autoHosted.current || mode !== 'create') return;
    if (!planLoaded || !canHost || !user || !name.trim()) return;
    autoHosted.current = true;
    setBusy(true);
    retroApi
      .createBoard('', name, '', '')
      .then((res) => {
        saveIdentity(res.board.code, res.participantId, name.trim());
        onEnter(res.board.code);
      })
      .catch((err) => {
        // Fall back to the form rather than stranding them on a spinner.
        setError((err as Error).message);
        setBusy(false);
      });
  }, [planLoaded, canHost, user, name, mode, onEnter]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      const res = await retroApi.createBoard(boardName, name, '', '');
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
      const res = await retroApi.joinBoard(code.trim(), joinName);
      saveIdentity(res.board.code, res.participantId, joinName.trim());
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
            {user ? (
              <p className="auth-hint">
                Hosting as <strong>{name}</strong>
              </p>
            ) : (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
              </label>
            )}
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
            {user || priorName ? (
              <p className="auth-hint">
                Joining as <strong>{joinName}</strong>
              </p>
            ) : (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
              </label>
            )}
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
