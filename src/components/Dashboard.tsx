import BrandLogo from './BrandLogo';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';

interface Props {
  onPlanning: () => void;
  onRetro: () => void;
  onTimesheet: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onSecurity: () => void;
}

// The home for signed-in (or guest) users: pick a ceremony.
export default function Dashboard({ onPlanning, onRetro, onTimesheet, onPrivacy, onTerms, onSecurity }: Props) {
  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand brand-with-logo">
          <BrandLogo />
        </div>
        <div className="dash-head-actions">
          <ThemeToggle />
          <ProfileMenu />
        </div>
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

        <button className="dash-card" onClick={onTimesheet}>
          <span className="dash-card-icon" aria-hidden>🗓️</span>
          <span className="dash-card-title">Daily Scrum &amp; Timesheet</span>
          <span className="dash-card-desc">
            Log your daily standup &amp; task hours once, then hand off to Keka / timesheets (copy or CSV).
          </span>
          <span className="dash-card-cta">Open →</span>
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
