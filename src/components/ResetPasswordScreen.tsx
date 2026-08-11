import { useState, type FormEvent } from 'react';
import { resetPasswordWithToken } from '../lib/auth';

interface Props {
  token: string;
  onDone: () => void;
}

export default function ResetPasswordScreen({ token, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setError('');
    setBusy(true);
    try {
      await resetPasswordWithToken(token, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h2>Invalid reset link</h2>
          <p className="auth-sub">This password-reset link is missing or malformed.</p>
          <button type="button" className="primary" onClick={onDone}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {done ? (
          <>
            <h2>Password updated</h2>
            <p className="auth-sub">Your password has been reset. You can now log in with your new password.</p>
            <button type="button" className="primary" onClick={onDone}>
              Go to login
            </button>
          </>
        ) : (
          <>
            <h2>Set a new password</h2>
            <p className="auth-sub">Choose a new password for your SprintDeck account.</p>
            <form className="auth-form" onSubmit={submit}>
              <label>
                New password
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="auth-hint">At least 8 characters</span>
              </label>
              <label>
                Confirm password
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  autoComplete="new-password"
                  required
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label className="pw-show">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
                Show passwords
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
              {error ? <p className="error">{error}</p> : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
