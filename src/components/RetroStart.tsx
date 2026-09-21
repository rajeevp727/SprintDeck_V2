import { useEffect, useRef, useState, type FormEvent } from 'react';
import { retroApi } from '../lib/retroApi';
import { saveIdentity } from '../lib/storage';
import { useSubscription } from '../lib/subscription';
import { useProfileNamePrefill } from '../lib/useProfileName';
import { useAuth } from '../lib/auth';
import AdBanner from './AdBanner';
import BrandLogo from './BrandLogo';

interface Props {
  onEnter: (code: string) => void;
  onBack: () => void;
}

/** Starting a retrospective. Members arrive by invite link, not by code. */
export default function RetroStart({ onEnter, onBack }: Props) {
  const { user } = useAuth();
  const { subscription, loaded: planLoaded } = useSubscription();
  const canHost = !!subscription;
  const [name, setName] = useProfileNamePrefill();
  const [boardName, setBoardName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoHosted = useRef(false);

  async function host(title: string) {
    setBusy(true);
    setError('');
    try {
      const res = await retroApi.createBoard(title, name, '', '');
      saveIdentity(res.board.code, res.participantId, name.trim());
      onEnter(res.board.code);
    } catch (err) {
      // Fall back to the form rather than stranding them on a spinner.
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // A subscriber who already has a name gets a board without being asked twice.
  useEffect(() => {
    if (autoHosted.current) return;
    if (!planLoaded || !canHost || !user || !name.trim()) return;
    autoHosted.current = true;
    host('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLoaded, canHost, user, name]);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    host(boardName);
  }

  return (
    <div className="home">
      <button className="ghost auth-back home-back" onClick={onBack} title="Back" aria-label="Back">
        <span aria-hidden>←</span>
        <span className="auth-back-label">Back</span>
      </button>

      <header className="brand">
        <BrandLogo variant="mark" />
        <h1>Retrospective</h1>
      </header>
      <p className="tagline">Reflect on the sprint together.</p>

      <div className="card home-card">
        <form onSubmit={handleCreate} className="form">
          {user ? (
            <p className="auth-hint">
              Hosting as <strong>{name}</strong>
            </p>
          ) : (
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="User Name"
                autoFocus
                maxLength={40}
              />
            </label>
          )}
          <label>
            Board name <span className="muted">(optional)</span>
            <input
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="Sprint {Number} Retrospective"
              maxLength={60}
            />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {busy ? 'Creating…' : 'Create & host'}
          </button>
          <p className="auth-hint">
            Hosting a retrospective needs a Pro subscription. Share the invite link from the board
            to bring your team in.
          </p>
        </form>

        {error && <p className="error">{error}</p>}
      </div>

      <AdBanner />
    </div>
  );
}
