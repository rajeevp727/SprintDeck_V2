import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

interface Props {
  onAuthed: () => void;
  onBack: () => void;
}

// One screen, split into two halves — Log in | Create account — divided by a
// large "/" glyph. Stacks vertically on narrow screens.
export default function AuthScreen({ onAuthed, onBack }: Props) {
  const { login, register } = useAuth();

  const [liEmail, setLiEmail] = useState('');
  const [liPw, setLiPw] = useState('');
  const [liErr, setLiErr] = useState('');
  const [liBusy, setLiBusy] = useState(false);

  const [rgName, setRgName] = useState('');
  const [rgEmail, setRgEmail] = useState('');
  const [rgPw, setRgPw] = useState('');
  const [rgErr, setRgErr] = useState('');
  const [rgBusy, setRgBusy] = useState(false);

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setLiErr('');
    setLiBusy(true);
    try {
      await login(liEmail, liPw);
      onAuthed();
    } catch (err) {
      setLiErr((err as Error).message);
      setLiBusy(false);
    }
  }

  async function doRegister(e: FormEvent) {
    e.preventDefault();
    setRgErr('');
    setRgBusy(true);
    try {
      await register(rgEmail, rgPw, rgName);
      onAuthed();
    } catch (err) {
      setRgErr((err as Error).message);
      setRgBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <button className="ghost auth-back" onClick={onBack}>
        ← Back
      </button>

      <div className="auth-split">
        <section className="auth-half">
          <h2>Log in</h2>
          <form className="auth-form" onSubmit={doLogin}>
            <label>
              Email
              <input
                type="email"
                value={liEmail}
                autoComplete="email"
                required
                onChange={(e) => setLiEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={liPw}
                autoComplete="current-password"
                required
                onChange={(e) => setLiPw(e.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={liBusy}>
              {liBusy ? 'Logging in…' : 'Log in'}
            </button>
            {liErr && <p className="error">{liErr}</p>}
          </form>
        </section>

        <div className="auth-slash" aria-hidden />

        <section className="auth-half">
          <h2>Create account</h2>
          <form className="auth-form" onSubmit={doRegister}>
            <label>
              Name
              <input value={rgName} autoComplete="name" onChange={(e) => setRgName(e.target.value)} />
            </label>
            <label>
              Email
              <input
                type="email"
                value={rgEmail}
                autoComplete="email"
                required
                onChange={(e) => setRgEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={rgPw}
                autoComplete="new-password"
                minLength={8}
                required
                onChange={(e) => setRgPw(e.target.value)}
              />
              <span className="auth-hint">At least 8 characters</span>
            </label>
            <button className="primary" type="submit" disabled={rgBusy}>
              {rgBusy ? 'Creating…' : 'Create account'}
            </button>
            {rgErr && <p className="error">{rgErr}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
