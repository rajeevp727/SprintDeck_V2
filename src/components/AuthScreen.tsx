import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth, checkName, peekName, forgotPassword, signInWithOAuth } from '../lib/auth';
import { getAccounts, forgetAccount, type RememberedAccount } from '../lib/rememberedAccounts';
import { InfoIcon, CloseIcon } from './icons';

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
  const [ssoBusy, setSsoBusy] = useState<'google' | 'microsoft' | null>(null);
  const [ssoErr, setSsoErr] = useState('');
  const liPwRef = useRef<HTMLInputElement>(null);

  const [rgName, setRgName] = useState('');
  const [rgNameStatus, setRgNameStatus] = useState<'idle' | 'short' | 'checking' | 'available' | 'taken'>('idle');
  const [rgNameSug, setRgNameSug] = useState<string[]>([]);
  const [rgEmail, setRgEmail] = useState('');
  const [rgPw, setRgPw] = useState('');
  const [rgShowPw, setRgShowPw] = useState(false);
  const [rgErr, setRgErr] = useState('');
  const [rgBusy, setRgBusy] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotEmailErr, setForgotEmailErr] = useState('');

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

  async function doSSO(provider: 'google' | 'microsoft') {
    setSsoErr('');
    setSsoBusy(provider);
    try {
      await signInWithOAuth(provider);
      onAuthed();
    } catch (err) {
      setSsoErr((err as Error).message);
      setSsoBusy(null);
    }
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
            <button
              type="button"
              className="ghost auth-forgot-btn"
              onClick={() => {
                setForgotEmail(liEmail);
                setForgotDone(false);
                setForgotErr('');
                setShowForgot(true);
              }}
            >
              Forgot password?
            </button>
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

          <div className="auth-divider" role="separator">
            <span>or continue with</span>
          </div>
          <div className="auth-sso-row">
            <button
              type="button"
              className="sso-btn sso-google"
              onClick={() => doSSO('google')}
              disabled={!!ssoBusy}
              title="Sign in with Google"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.3v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.08z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-1 7.28-2.69l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {ssoBusy === 'google' ? 'Signing in…' : 'Google'}
            </button>
            <button
              type="button"
              className="sso-btn sso-microsoft"
              onClick={() => doSSO('microsoft')}
              disabled={!!ssoBusy}
              title="Sign in with Microsoft"
            >
              <svg viewBox="0 0 21 21" width="20" height="20" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f3f3f3"/>
                <rect x="11" y="1" width="9" height="9" fill="#f3f3f3"/>
                <rect x="1" y="11" width="9" height="9" fill="#f3f3f3"/>
                <rect x="11" y="11" width="9" height="9" fill="#f3f3f3"/>
              </svg>
              {ssoBusy === 'microsoft' ? 'Signing in…' : 'Microsoft'}
            </button>
          </div>
          {ssoErr && <p className="error auth-sso-error">{ssoErr}</p>}
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

      {showForgot && (
        <div className="modal-overlay" onClick={() => setShowForgot(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowForgot(false)} aria-label="Close" title="Close">
              <CloseIcon />
            </button>

            {forgotDone ? (
              <>
                <h3>Check your inbox</h3>
                <p className="auth-sub">
                  If an account exists for <strong>{forgotEmail}</strong>, we’ve sent a password-reset link.
                </p>
                <button className="primary" onClick={() => setShowForgot(false)}>
                  Back to login
                </button>
              </>
            ) : (
              <>
                <h3>Reset your password</h3>
                <p className="auth-sub">Enter the email associated with your account.</p>
                <form
                  className="auth-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = forgotEmail.trim();
                    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                      setForgotEmailErr('Please enter a valid email');
                      return;
                    }
                    setForgotEmailErr('');
                    setForgotBusy(true);
                    forgotPassword(val)
                      .then(() => setForgotDone(true))
                      .catch((err) => setForgotErr((err as Error).message))
                      .finally(() => setForgotBusy(false));
                  }}
                >
                  <label>
                    Email
                    <input
                      type="email"
                      value={forgotEmail}
                      autoComplete="email"
                      required
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        if (forgotEmailErr) setForgotEmailErr('');
                      }}
                    />
                    {forgotEmailErr && <span className="auth-hint hint-error">{forgotEmailErr}</span>}
                  </label>
                  <div className="auth-cta">
                    <button type="submit" className="primary" disabled={forgotBusy}>
                      {forgotBusy ? 'Sending…' : 'Send reset link'}
                    </button>
                    <button type="button" className="ghost auth-switch-btn" onClick={() => setShowForgot(false)}>
                      Cancel
                    </button>
                  </div>
                  {forgotErr && <p className="error">{forgotErr}</p>}
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
