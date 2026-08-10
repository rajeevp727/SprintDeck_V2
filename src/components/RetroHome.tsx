import { useEffect, useState } from 'react';
import { retroApi } from '../lib/retroApi';
import { saveIdentity, getIdentity, getCurrentRoom } from '../lib/storage';
import AdBanner from './AdBanner';

interface Props {
  joinCode: string;
  onEnter: (code: string) => void;
  onExit: () => void;
}

function knownNameFromRoom(): string {
  const room = getCurrentRoom();
  return room ? getIdentity(room)?.name ?? '' : '';
}

export default function RetroHome({ joinCode, onEnter, onExit }: Props) {
  const knownName = knownNameFromRoom();
  const [name, setName] = useState(knownName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoJoining, setAutoJoining] = useState(!!knownName);

  async function join(displayName: string) {
    const res = await retroApi.joinBoard(joinCode, displayName);
    saveIdentity(res.board.code, res.participantId, displayName.trim());
    onEnter(res.board.code);
  }

  useEffect(() => {
    if (!knownName) return;
    let cancelled = false;
    join(knownName).catch((err) => {
      if (cancelled) return;
      setError((err as Error).message);
      setAutoJoining(false);
    });
    return () => {
      cancelled = true;
    };
  }, [joinCode, knownName]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    try {
      await join(name);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (autoJoining) {
    return (
      <div className="room-loading">
        <p>Joining the retrospective…</p>
      </div>
    );
  }

  return (
    <div className="home">
      <header className="brand">
        <span className="brand-mark">🗂️</span>
        <h1>SprintDeck Retro</h1>
      </header>
      <p className="tagline">Join the retrospective and add your notes.</p>

      <div className="card home-card">
        <form onSubmit={handleJoin} className="form">
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="User Name" autoFocus maxLength={40} />
          </label>
          <label>
            Board code
            <input value={joinCode} className="code-input" readOnly title="From your invite link" />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {busy ? 'Joining…' : 'Join retrospective'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>

      <AdBanner />

      <footer className="home-footer">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onExit();
          }}
        >
          ← Home
        </a>
      </footer>
    </div>
  );
}
