import { useEffect, useState } from 'react';
import { retroApi } from '../lib/retroApi';
import { saveIdentity, getIdentity, getCurrentRoom } from '../lib/storage';
import { useAuth } from '../lib/auth';
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
  const { user } = useAuth();
  // A signed-in person already told us their name; only a guest has to type one.
  const accountName = user ? user.name?.trim() || user.email.split('@')[0] : '';
  const autoName = knownNameFromRoom() || accountName;
  const [name, setName] = useState(autoName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoJoinFailed, setAutoJoinFailed] = useState(false);
  const [autoJoining, setAutoJoining] = useState(!!autoName);

  async function join(displayName: string) {
    const res = await retroApi.joinBoard(joinCode, displayName);
    saveIdentity(res.board.code, res.participantId, displayName.trim());
    onEnter(res.board.code);
  }

  useEffect(() => {
    setName((current) => current || autoName);
  }, [autoName]);

  useEffect(() => {
    if (!autoName || autoJoinFailed) return;
    let cancelled = false;
    setAutoJoining(true);
    join(autoName).catch((err) => {
      if (cancelled) return;
      setError((err as Error).message);
      setAutoJoining(false);
      setAutoJoinFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [joinCode, autoName, autoJoinFailed]);

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
