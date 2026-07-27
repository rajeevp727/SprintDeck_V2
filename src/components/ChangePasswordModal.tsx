import { useEffect, useState, type FormEvent } from 'react';
import { changePassword } from '../lib/auth';
import { CloseIcon } from './icons';

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setError('New password must be at least 8 characters');
    if (next !== confirm) return setError('New passwords don’t match');
    if (next === current) return setError('New password must be different from the current one');
    setError('');
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close" title="Close">
          <CloseIcon />
        </button>

        {done ? (
          <div className="pw-done">
            <div className="pw-check" aria-hidden>✓</div>
            <h3>Password updated</h3>
            <p className="auth-sub">Your password has been changed.</p>
          </div>
        ) : (
          <>
            <h3>Change password</h3>
            <p className="auth-sub">Enter your current password and choose a new one.</p>
            <form className="auth-form" onSubmit={submit}>
              <label>
                Current password
                <input
                  type={type}
                  value={current}
                  autoComplete="current-password"
                  autoFocus
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type={type}
                  value={next}
                  autoComplete="new-password"
                  minLength={8}
                  onChange={(e) => setNext(e.target.value)}
                />
                <span className="auth-hint">At least 8 characters</span>
              </label>
              <label>
                Confirm new password
                <input
                  type={type}
                  value={confirm}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label className="pw-show">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
                Show passwords
              </label>

              <div className="pw-actions">
                <button type="button" className="ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? 'Updating…' : 'Update password'}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
