import { useEffect, useState, type FormEvent } from 'react';
import {
  changePassword,
  checkName,
  deleteAccount,
  exportAccountData,
  getEmailStatus,
  peekName,
  requestPasswordChangeEmail,
  updateProfile,
  type AuthUser,
} from '../lib/auth';
import { CloseIcon } from './icons';

interface Props {
  user: AuthUser;
  onClose: () => void;
  onUpdated?: (user: AuthUser) => void;
}

const DELETE_CONFIRM_WORD = 'DELETE';

export default function ProfileSettingsModal({ user, onClose, onUpdated }: Props) {
  const [name, setName] = useState(user.name || '');
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameDone, setNameDone] = useState(false);
  const [nameError, setNameError] = useState('');

  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwEmailedTo, setPwEmailedTo] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [useDirectPw, setUseDirectPw] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportDone, setExportDone] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    getEmailStatus()
      .then((s) => {
        if (!cancelled) {
          setEmailConfigured(s.configured);
          if (!s.configured) setUseDirectPw(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmailConfigured(false);
          setUseDirectPw(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function sendPasswordLink() {
    setPwError('');
    setPwBusy(true);
    try {
      const { emailedTo } = await requestPasswordChangeEmail();
      setPwEmailedTo(emailedTo || user.email);
      setPwDone(true);
      setEmailConfigured(true);
      setUseDirectPw(false);
    } catch (err) {
      const msg = (err as Error).message;
      setPwError(msg);
      setPwDone(false);
      if (/not configured/i.test(msg)) {
        setEmailConfigured(false);
        setUseDirectPw(true);
      }
    } finally {
      setPwBusy(false);
    }
  }

  async function savePasswordDirect(e: FormEvent) {
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
      setTimeout(() => setPwDone(false), 2500);
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  async function downloadExport() {
    setExportError('');
    setExportDone(false);
    setExportBusy(true);
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sprintdeck-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExportBusy(false);
    }
  }

  function resetDeleteFlow() {
    setDeleteOpen(false);
    setDeleteAck(false);
    setDeleteConfirm('');
    setDeletePw('');
    setShowDeletePw(false);
    setDeleteError('');
  }

  async function confirmDelete(e: FormEvent) {
    e.preventDefault();
    if (!deleteAck) return setDeleteError('Confirm that you understand this action is permanent');
    if (deleteConfirm.trim().toUpperCase() !== DELETE_CONFIRM_WORD) {
      return setDeleteError(`Type ${DELETE_CONFIRM_WORD} to confirm`);
    }
    if (!deletePw) return setDeleteError('Enter your password to confirm deletion');
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await deleteAccount(deletePw);
      onClose();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const nameChanged = name.trim().toLowerCase() !== (user.name || '').trim().toLowerCase();
  const canSaveName = nameChanged && name.trim().length >= 2 && nameStatus !== 'taken' && nameStatus !== 'checking';
  const deleteReady =
    deleteAck && deleteConfirm.trim().toUpperCase() === DELETE_CONFIRM_WORD && deletePw.length > 0 && !deleteBusy;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pw-modal profile-settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close" title="Close">
          <CloseIcon />
        </button>

        <h3>Account settings</h3>
        <p className="auth-sub">Manage your profile, password, and data.</p>

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

        <section className="profile-settings-section" aria-labelledby="password-heading">
          <h4 id="password-heading">Password</h4>
          {emailConfigured === null ? (
            <p className="auth-hint">Checking password options…</p>
          ) : emailConfigured === false || useDirectPw ? (
            <>
              <p className="auth-hint">Confirm your current password, then choose a new one.</p>
              {emailConfigured === false ? (
                <div className="pw-email-setup" role="status">
                  <p className="auth-hint">
                    Email delivery is not configured on the live server yet. Add{' '}
                    <strong>RESEND_API_KEY</strong> and <strong>EMAIL_FROM</strong> in Azure Static Web Apps →
                    Configuration → Application settings to enable one-time email links.
                  </p>
                </div>
              ) : null}
              {pwDone && !pwEmailedTo ? (
                <p className="auth-hint" style={{ color: 'var(--green)' }} role="status">
                  Password updated
                </p>
              ) : (
                <form className="auth-form" onSubmit={savePasswordDirect}>
                  <label>
                    Current password
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={current}
                      autoComplete="current-password"
                      onChange={(e) => setCurrent(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    New password
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={next}
                      autoComplete="new-password"
                      minLength={8}
                      onChange={(e) => setNext(e.target.value)}
                      required
                    />
                    <span className="auth-hint">At least 8 characters</span>
                  </label>
                  <label>
                    Confirm new password
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      autoComplete="new-password"
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </label>
                  <label className="pw-show">
                    <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
                    Show passwords
                  </label>
                  <button type="submit" className="primary" disabled={pwBusy}>
                    {pwBusy ? 'Updating…' : 'Reset / change password'}
                  </button>
                  {emailConfigured ? (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        setUseDirectPw(false);
                        setPwError('');
                        setPwDone(false);
                      }}
                    >
                      Prefer email link instead
                    </button>
                  ) : null}
                  {pwError ? <p className="error">{pwError}</p> : null}
                </form>
              )}
            </>
          ) : (
            <>
              <p className="auth-hint">
                For security, password changes are completed through a one-time link sent to your email — we never
                ask you to type a new password here.
              </p>
              <ul className="gdpr-list">
                <li>Link is sent only to your account email</li>
                <li>Expires in 30 minutes and can be used once</li>
                <li>If you did not request it, ignore the email — your password stays the same</li>
              </ul>
              {pwDone ? (
                <div className="pw-email-sent" role="status">
                  <p className="auth-hint" style={{ color: 'var(--green)' }}>
                    Check <strong>{pwEmailedTo || user.email}</strong> for a secure password link.
                  </p>
                  <p className="auth-hint">Open the link to choose a new password, then sign in again if prompted.</p>
                  <div className="profile-gdpr-actions">
                    <button type="button" className="ghost" onClick={sendPasswordLink} disabled={pwBusy}>
                      {pwBusy ? 'Sending…' : 'Resend link'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="profile-gdpr-actions">
                  <button type="button" className="primary" onClick={sendPasswordLink} disabled={pwBusy}>
                    {pwBusy ? 'Sending…' : 'Reset / change password'}
                  </button>
                </div>
              )}
              {pwError ? <p className="error">{pwError}</p> : null}
            </>
          )}
        </section>

        <section className="profile-settings-section profile-settings-gdpr" aria-labelledby="gdpr-export-heading">
          <h4 id="gdpr-export-heading">Download your data</h4>
          <p className="auth-hint">
            Request a machine-readable copy of the personal data we hold for this account (GDPR Art. 20 —
            data portability).
          </p>
          <ul className="gdpr-list">
            <li>Account profile (email, display name, created / updated dates)</li>
            <li>Subscription and order history (tier, status, timestamps)</li>
            <li>Delivered as a JSON file you can keep or transfer</li>
          </ul>
          <p className="auth-hint gdpr-note">
            Passwords, session tokens, and ephemeral ceremony rooms are not included.
          </p>
          <div className="profile-gdpr-actions">
            <button type="button" className="ghost" onClick={downloadExport} disabled={exportBusy}>
              {exportBusy ? 'Preparing export…' : 'Download my data'}
            </button>
          </div>
          {exportDone ? (
            <p className="auth-hint" style={{ color: 'var(--green)' }} role="status">
              Export ready — check your downloads folder.
            </p>
          ) : null}
          {exportError ? <p className="error">{exportError}</p> : null}
        </section>

        <section className="profile-settings-section profile-danger-zone" aria-labelledby="danger-zone-heading">
          <h4 id="danger-zone-heading">Danger zone</h4>
          <p className="auth-hint">
            Permanently delete your SprintDeck account. This cannot be undone.
          </p>

          {!deleteOpen ? (
            <div className="profile-gdpr-actions">
              <button type="button" className="ghost danger" onClick={() => setDeleteOpen(true)}>
                Delete my account…
              </button>
            </div>
          ) : (
            <form className="auth-form profile-delete-form" onSubmit={confirmDelete}>
              <div className="gdpr-warn" role="alert">
                <p className="gdpr-warn-title">Before you continue</p>
                <ul className="gdpr-list">
                  <li>Your profile and login will be removed immediately</li>
                  <li>Linked subscription records will be anonymised</li>
                  <li>You will be signed out on this device</li>
                  <li>This action is permanent — we cannot restore the account</li>
                </ul>
                <p className="auth-hint">
                  We recommend downloading your data first if you may need a copy later.
                </p>
              </div>

              <label className="gdpr-ack">
                <input
                  type="checkbox"
                  checked={deleteAck}
                  onChange={(e) => {
                    setDeleteAck(e.target.checked);
                    setDeleteError('');
                  }}
                />
                <span>I understand that deleting my account is permanent and cannot be undone.</span>
              </label>

              <label>
                Type <strong>{DELETE_CONFIRM_WORD}</strong> to confirm
                <input
                  value={deleteConfirm}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={DELETE_CONFIRM_WORD}
                  onChange={(e) => {
                    setDeleteConfirm(e.target.value);
                    setDeleteError('');
                  }}
                  aria-describedby="delete-confirm-hint"
                />
                <span id="delete-confirm-hint" className="auth-hint">
                  Confirmation is case-insensitive
                </span>
              </label>

              <label>
                Password
                <input
                  type={showDeletePw ? 'text' : 'password'}
                  value={deletePw}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  onChange={(e) => {
                    setDeletePw(e.target.value);
                    setDeleteError('');
                  }}
                />
              </label>
              <label className="pw-show">
                <input
                  type="checkbox"
                  checked={showDeletePw}
                  onChange={(e) => setShowDeletePw(e.target.checked)}
                />
                Show password
              </label>

              <div className="profile-delete-actions">
                <button type="button" className="ghost" onClick={resetDeleteFlow} disabled={deleteBusy}>
                  Cancel
                </button>
                <button type="submit" className="danger" disabled={!deleteReady}>
                  {deleteBusy ? 'Deleting account…' : 'Permanently delete account'}
                </button>
              </div>
              {deleteError ? <p className="error">{deleteError}</p> : null}
            </form>
          )}
        </section>

        <p className="auth-hint profile-settings-email">Signed in as {user.email}</p>
      </div>
    </div>
  );
}
