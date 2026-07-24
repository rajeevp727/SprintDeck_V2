import { useAuth } from '../lib/auth';

interface Props {
  onPlanning: () => void;
  onRetro: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onSecurity: () => void;
}

// The home for signed-in (or guest) users: pick a ceremony.
export default function Dashboard({ onPlanning, onRetro, onPrivacy, onTerms, onSecurity }: Props) {
  const { user, logout } = useAuth();

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden>♠</span>
          <h1>SprintDeck</h1>
        </div>
        {user && (
          <div className="dash-user">
            <span>
              Hi, <strong>{user.name || user.email}</strong>
            </span>
            <button className="ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <p className="dash-lead">Choose a ceremony to run with your team.</p>

      <div className="dash-cards">
        <button className="dash-card" onClick={onPlanning}>
          <span className="dash-card-icon" aria-hidden>🃏</span>
          <span className="dash-card-title">Sprint Planning</span>
          <span className="dash-card-desc">
            Planning poker — estimate stories together with hidden votes, reveal & consensus.
          </span>
          <span className="dash-card-cta">Start or join →</span>
        </button>

        <button className="dash-card" onClick={onRetro}>
          <span className="dash-card-icon" aria-hidden>🗂️</span>
          <span className="dash-card-title">Sprint Retrospective</span>
          <span className="dash-card-desc">
            Review last sprint’s actions, then capture what went well, what to improve & next actions.
          </span>
          <span className="dash-card-cta">Start or join →</span>
        </button>
      </div>

      <footer className="dash-footer">
        <span>© SprintDeck</span>
        <span className="footer-sep">·</span>
        <a href="/privacy" onClick={(e) => { e.preventDefault(); onPrivacy(); }}>
          Privacy
        </a>
        <span className="footer-sep">·</span>
        <a href="/terms" onClick={(e) => { e.preventDefault(); onTerms(); }}>
          Terms
        </a>
        <span className="footer-sep">·</span>
        <a href="/security" onClick={(e) => { e.preventDefault(); onSecurity(); }}>
          Security
        </a>
      </footer>
    </div>
  );
}
