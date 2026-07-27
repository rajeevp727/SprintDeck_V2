import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';

const ChangePasswordModal = lazy(() => import('./ChangePasswordModal'));

// Account chip in the header: greeting + avatar that opens a card with the
// user's name, email and a Sign out button. Closes on outside click / Escape.
export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const raw = (user.name || user.email.split('@')[0] || '').trim();
  const displayName = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : user.email;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="profile" ref={ref}>
      <button
        className="profile-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
      >
        <span className="profile-hi">
          Hi, <strong>{displayName}</strong>
        </span>
        <span className="profile-avatar-sm" aria-hidden>
          {initial}
        </span>
      </button>

      {open && (
        <div className="profile-menu profile-card" role="menu">
          <div className="profile-card-head">
            <span className="profile-avatar" aria-hidden>
              {initial}
            </span>
            <div className="profile-card-id">
              <div className="profile-name">{displayName}</div>
              <div className="profile-email" title={user.email}>
                {user.email}
              </div>
            </div>
          </div>
          <div className="profile-card-actions">
            <button
              className="profile-item"
              onClick={() => {
                setOpen(false);
                setShowPw(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Change password
            </button>
            <button className="profile-item danger" onClick={logout}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}

      {showPw && (
        <Suspense fallback={null}>
          <ChangePasswordModal onClose={() => setShowPw(false)} />
        </Suspense>
      )}
    </div>
  );
}
