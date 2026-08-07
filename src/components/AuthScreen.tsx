import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth, checkName, peekName } from '../lib/auth';
import { getAccounts, forgetAccount, type RememberedAccount } from '../lib/rememberedAccounts';
import { InfoIcon } from './icons';

interface Props {
  onAuthed: () => void;
  onBack: () => void;
}

// Two leaves that meet at a diagonal "/" spine: Log in fills the left up to the
// slash, Create account the right. Switching folds one leaf away at the spine
// while the other opens — like turning a book page across the "/".
export default function AuthScreen({ onAuthed, onBack }: Props) {
  const { login, register } = useAuth();
  const [active, setActive] = useState<'login' | 'signup'>('login');
  const [accounts, setAccounts] = useState<RememberedAccount[]>(getAccounts());
  const [showPwInfo, setShowPwInfo] = useState(false);

  const [liEmail, setLiEmail] = useState('');
  const [liPw, setLiPw] = useState('');
  const [liShowPw, setLiShowPw] = useState(false);
  const [liRemember, setLiRemember] = useState(true);
  const [liErr, setLiErr] = useState('');
  const [liBusy, setLiBusy] = useState(false);
  const liPwRef = useRef<HTMLInputElement>(null);

  const [rgName, setRgName] = useState('');
  const [rgNameStatus, setRgNameStatus] = useState<'idle' | 'short' | 'checking' | 'available' | 'taken'>('idle');
  const [rgNameSug, setRgNameSug] = useState<string[]>([]);
  const [rgEmail, setRgEmail] = useState('');
  const [rgPw, setRgPw] = useState('');
  const [rgShowPw, setRgShowPw] = useState(false);
  const [rgErr, setRgErr] = useState('');
  const [rgBusy, setRgBusy] = useState(false);

  // Tap a saved account → prefill its email and jump to the password field.
  function pickAccount(a: RememberedAccount) {
    setActive('login');
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

  // Live (debounced) name-availability check while signing up.
  useEffect(() => {
    const n = rgName.trim();
    if (n.length === 0) {
      setRgNameStatus('idle');
      setRgNameSug([]);
      return;
    }
    if (n.length < 2) {
      setRgNameStatus('short');
      setRgNameSug([]);
      return;
    }
    // instant path — already checked this name (no network / debounce)
    const cached = peekName(n);
    if (cached) {
      setRgNameStatus(cached.available ? 'available' : 'taken');
      setRgNameSug(cached.available ? [] : cached.suggestions);
      return;
    }
    setRgNameStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await checkName(n);
      if (cancelled) return;
      setRgNameStatus(r.available ? 'available' : 'taken');
      setRgNameSug(r.available ? [] : r.suggestions);
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rgName]);

  // Close password info tooltip when clicking outside.
  useEffect(() => {
    if (!showPwInfo) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('.pw-info') && !target.closest('.pw-tooltip')) {
        setShowPwInfo(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [showPwInfo]);

  function applySuggestion(s: string) {
    setRgName(s);
    setRgNameSug([]);
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

      <div className="auth-book">
        <div className="auth-slash-line" aria-hidden />

        {/* ---- Log in (left leaf) ---- */}
        <section
          className={`auth-leaf leaf-login ${active === 'login' ? 'open' : 'folded'}`}
          aria-hidden={active !== 'login'}
        >
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
              <span className="auth-label-row">
                Password
                <span
                  className="pw-info"
                  role="button"
                  tabIndex={0}
                  aria-label="Show password hint"
                  onClick={() => setShowPwInfo((s) => !s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowPwInfo((s) => !s);
                    }
                  }}
                >
                  <InfoIcon />
                </span>
              </span>
              <input
                ref={liPwRef}
                type={liShowPw ? 'text' : 'password'}
                value={liPw}
                autoComplete="current-password"
                required
                onDoubleClick={() => setLiShowPw((s) => !s)}
                onChange={(e) => setLiPw(e.target.value)}
              />
              {showPwInfo && (
                <span className="pw-tooltip" role="tooltip">
                  Double-click the field to show or hide your password
                </span>
              )}
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
              <button type="button" className="ghost auth-switch-btn" onClick={() => setActive('signup')}>
                Create account
              </button>
            </div>
            {liErr && <p className="error">{liErr}</p>}
          </form>
        </section>

        {/* ---- Create account (right leaf) ---- */}
        <section
          className={`auth-leaf leaf-create ${active === 'signup' ? 'open' : 'folded'}`}
          aria-hidden={active !== 'signup'}
        >
          <h2>Create account</h2>
          <form className="auth-form" onSubmit={doRegister}>
            <div className="auth-row">
              <label>
                Name
                <input
                  value={rgName}
                  autoComplete="name"
                  required
                  minLength={2}
                  aria-invalid={rgNameStatus === 'taken'}
                  className={
                    rgNameStatus === 'taken' ? 'input-error' : rgNameStatus === 'available' ? 'input-ok' : undefined
                  }
                  onChange={(e) => setRgName(e.target.value)}
                />
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
            </div>
            {rgNameStatus !== 'idle' && (
              <div className={`auth-name-status status-${rgNameStatus}`}>
                {rgNameStatus === 'short' && <span>Name must be at least 2 characters</span>}
                {rgNameStatus === 'checking' && <span>Checking availability…</span>}
                {rgNameStatus === 'available' && (
                  <span>
                    <span aria-hidden>✓</span> “{rgName.trim()}” is available
                  </span>
                )}
                {rgNameStatus === 'taken' && (
                  <>
                    <span>
                      <span aria-hidden>✗</span> That name is taken.
                    </span>
                    {rgNameSug.length > 0 && (
                      <span className="auth-name-sug">
                        Try:
                        {rgNameSug.map((s) => (
                          <button type="button" key={s} className="auth-name-chip" onClick={() => applySuggestion(s)}>
                            {s}
                          </button>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            <label>
              <span className="auth-label-row">
                Password
                <span
                  className="pw-info"
                  role="button"
                  tabIndex={0}
                  aria-label="Show password hint"
                  onClick={() => setShowPwInfo((s) => !s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowPwInfo((s) => !s);
                    }
                  }}
                >
                  <InfoIcon />
                </span>
              </span>
              <input
                type={rgShowPw ? 'text' : 'password'}
                value={rgPw}
                autoComplete="new-password"
                minLength={8}
                required
                aria-invalid={rgPw.length > 0 && rgPw.length < 8}
                className={rgPw.length > 0 && rgPw.length < 8 ? 'input-error' : undefined}
                onDoubleClick={() => setRgShowPw((s) => !s)}
                onChange={(e) => setRgPw(e.target.value)}
              />
              {rgPw.length > 0 && rgPw.length < 8 ? (
                <span className="auth-hint hint-error">At least 8 characters</span>
              ) : null}
              {showPwInfo && (
                <span className="pw-tooltip" role="tooltip">
                  Double-click the field to show or hide your password
                </span>
              )}
            </label>
            <div className="auth-cta">
              <button className="primary" type="submit" disabled={rgBusy}>
                {rgBusy ? 'Creating…' : 'Create account'}
              </button>
              <button type="button" className="ghost auth-switch-btn" onClick={() => setActive('login')}>
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
