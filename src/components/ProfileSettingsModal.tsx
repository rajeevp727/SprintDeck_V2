import { useEffect, useState, type FormEvent } from 'react';
import { changePassword, checkName, peekName, updateProfile, type AuthUser } from '../lib/auth';
import { CloseIcon } from './icons';

interface Props {
  user: AuthUser;
  onClose: () => void;
  onUpdated?: (user: AuthUser) => void;
}

export default function ProfileSettingsModal({ user, onClose, onUpdated }: Props) {
  const [name, setName] = useState(user.name || '');
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameDone, setNameDone] = useState(false);
  const [nameError, setNameError] = useState('');

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameStatus('idle');
      return;
    }
    if (trimmed.toLowerCase() === (user.name || '').trim().toLowerCase()) {
      setNameStatus('ok');
      return;
    }
    const cached = peekName(trimmed);
    if (cached) {
      setNameStatus(cached.available ? 'ok' : 'taken');
      return;
    }
    setNameStatus('checking');
    const id = window.setTimeout(async () => {
      const res = await checkName(trimmed);
      setNameStatus(res.available ? 'ok' : 'taken');
    }, 350);
    return () => clearTimeout(id);
  }, [name, user.name]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setNameError('Enter at least 2 characters');
    if (trimmed.toLowerCase() === (user.name || '').trim().toLowerCase()) return;
    if (nameStatus === 'taken') return setNameError('That name is already taken');
    setNameError('');
    setNameBusy(true);
    try {
      const updated = await updateProfile(trimmed);
      setNameDone(true);
      onUpdated?.(updated);
      setTimeout(() => setNameDone(false), 1500);
    } catch (err) {
      setNameError((err as Error).message);
    } finally {
      setNameBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setPwError('New password must be at least 8 characters');
    if (next !== confirm) return setPwError('New passwords don’t match');
    if (next === current) return setPwError('New password must be different from the current one');
    setPwError('');
    setPwBusy(true);
    try {
      await changePassword(current, next);
      setPwDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setTimeout(() => setPwDone(false), 1500);
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  const nameChanged = name.trim().toLowerCase() !== (user.name || '').trim().toLowerCase();
  const canSaveName = nameChanged && name.trim().length >= 2 && nameStatus !== 'taken' && nameStatus !== 'checking';
  const pwType = showPw ? 'text' : 'password';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pw-modal profile-settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close" title="Close">
          <CloseIcon />
        </button>

        <h3>Account settings</h3>
        <p className="auth-sub">Update your display name and password.</p>

        <section className="profile-settings-section">
          <h4>Display name</h4>
          <form className="auth-form" onSubmit={saveName}>
            <label>
              Username
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
              {nameStatus === 'checking' ? <span className="auth-hint">Checking availability…</span> : null}
              {nameStatus === 'taken' ? <span className="auth-hint hint-error">That name is taken</span> : null}
              {nameDone ? <span className="auth-hint" style={{ color: 'var(--green)' }}>Name updated</span> : null}
            </label>
            <button type="submit" className="primary" disabled={nameBusy || !canSaveName}>
              {nameBusy ? 'Saving…' : 'Save name'}
            </button>
            {nameError ? <p className="error">{nameError}</p> : null}
          </form>
        </section>

        <section className="profile-settings-section">
          <h4>Password</h4>
          {pwDone ? (
            <p className="auth-hint" style={{ color: 'var(--green)' }}>Password updated</p>
          ) : (
            <form className="auth-form" onSubmit={savePassword}>
              <label>
                Current password
                <input
                  type={pwType}
                  value={current}
                  autoComplete="current-password"
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type={pwType}
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
                  type={pwType}
                  value={confirm}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label className="pw-show">
                <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
                Show passwords
              </label>
              <button type="submit" className="primary" disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
              {pwError ? <p className="error">{pwError}</p> : null}
            </form>
          )}
        </section>

        <p className="auth-hint profile-settings-email">Signed in as {user.email}</p>
      </div>
    </div>
  );
}
