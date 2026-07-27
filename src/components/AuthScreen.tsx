import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { getAccounts, forgetAccount, type RememberedAccount } from '../lib/rememberedAccounts';
import { EyeIcon, EyeOffIcon } from './icons';

interface Props {
  onAuthed: () => void;
  onBack: () => void;
}

// Two sides split by a diagonal "/" spine. Each side stacks its submit button and
// a counterpart button; clicking the counterpart folds the whole card in half on
// the spine, then opens the other side.
export default function AuthScreen({ onAuthed, onBack }: Props) {
  const { login, register } = useAuth();
  const [active, setActive] = useState<'login' | 'signup'>('login');
  const [folding, setFolding] = useState(false);
  const [accounts, setAccounts] = useState<RememberedAccount[]>(getAccounts());

  const [liEmail, setLiEmail] = useState('');
  const [liPw, setLiPw] = useState('');
  const [liShowPw, setLiShowPw] = useState(false);
  const [liRemember, setLiRemember] = useState(true);
  const [liErr, setLiErr] = useState('');
  const [liBusy, setLiBusy] = useState(false);
  const liPwRef = useRef<HTMLInputElement>(null);

  const [rgName, setRgName] = useState('');
  const [rgEmail, setRgEmail] = useState('');
  const [rgPw, setRgPw] = useState('');
  const [rgShowPw, setRgShowPw] = useState(false);
  const [rgErr, setRgErr] = useState('');
  const [rgBusy, setRgBusy] = useState(false);

  // Fold the whole card in half, swap sides at the closed point, then open.
  function flipTo(side: 'login' | 'signup') {
    if (side === active || folding) return;
    setFolding(true);
    window.setTimeout(() => setActive(side), 480);
    window.setTimeout(() => setFolding(false), 500);
  }

  // Tap a saved account → prefill its email and jump to the password field.
  function pickAccount(a: RememberedAccount) {
    setLiEmail(a.email);
    setLiErr('');
    requestAnimationFrame(() => liPwRef.current?.focus());
  }
  function forget(email: string) {
    forgetAccount(email);
    setAccounts(getAccounts());
  }

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setLiErr('');
    setLiBusy(true);
    try {
      await login(liEmail, liPw, liRemember);
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
      <button className="ghost auth-back" onClick={onBack} title="Back" aria-label="Back">
        <span aria-hidden>←</span>
        <span className="auth-back-label">Back</span>
      </button>

      <div className={`auth-duo ${folding ? 'folding' : ''}`}>
        {/* ---- Log in ---- */}
        <section className={`auth-side side-login ${active === 'login' ? 'shown' : 'hidden'}`} aria-hidden={active !== 'login'}>
          <h2>Log in</h2>

          {accounts.length > 0 && (
            <div className="auth-suggest">
              <div className="auth-suggest-label">Saved accounts</div>
              <ul>
                {accounts.map((a) => (
                  <li key={a.email}>
                    <button type="button" className="auth-suggest-row" onClick={() => pickAccount(a)}>
                      <span className="auth-suggest-avatar" aria-hidden>
                        {(a.name || a.email).charAt(0).toUpperCase()}
                      </span>
                      <span className="auth-suggest-id">
                        <span className="auth-suggest-name">{a.name || a.email.split('@')[0]}</span>
                        <span className="auth-suggest-email">{a.email}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="auth-suggest-x"
                      onClick={() => forget(a.email)}
                      aria-label={`Forget ${a.email}`}
                      title="Forget this account"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              <div className="pw-field">
                <input
                  ref={liPwRef}
                  type={liShowPw ? 'text' : 'password'}
                  value={liPw}
                  autoComplete="current-password"
                  required
                  onChange={(e) => setLiPw(e.target.value)}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setLiShowPw((s) => !s)}
                  aria-label={liShowPw ? 'Hide password' : 'Show password'}
                  aria-pressed={liShowPw}
                  title={liShowPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {liShowPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <label className="auth-remember">
              <input type="checkbox" checked={liRemember} onChange={(e) => setLiRemember(e.target.checked)} />
              <span>
                Remember me <span className="auth-remember-note">— keep me signed in for 2 sprints (~28 days)</span>
              </span>
            </label>
            <div className="auth-cta">
              <button className="primary" type="submit" disabled={liBusy}>
                {liBusy ? 'Logging in…' : 'Log in'}
              </button>
              <button type="button" className="ghost auth-switch-btn" onClick={() => flipTo('signup')}>
                Create account
              </button>
            </div>
            {liErr && <p className="error">{liErr}</p>}
          </form>
        </section>

        <div className="auth-spine" aria-hidden />

        {/* ---- Create account ---- */}
        <section className={`auth-side side-signup ${active === 'signup' ? 'shown' : 'hidden'}`} aria-hidden={active !== 'signup'}>
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
              <div className="pw-field">
                <input
                  type={rgShowPw ? 'text' : 'password'}
                  value={rgPw}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  onChange={(e) => setRgPw(e.target.value)}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setRgShowPw((s) => !s)}
                  aria-label={rgShowPw ? 'Hide password' : 'Show password'}
                  aria-pressed={rgShowPw}
                  title={rgShowPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {rgShowPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <span className="auth-hint">At least 8 characters</span>
            </label>
            <div className="auth-cta">
              <button className="primary" type="submit" disabled={rgBusy}>
                {rgBusy ? 'Creating…' : 'Create account'}
              </button>
              <button type="button" className="ghost auth-switch-btn" onClick={() => flipTo('login')}>
                Log in
              </button>
            </div>
            {rgErr && <p className="error">{rgErr}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
