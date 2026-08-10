import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';

interface Props {
  onSignIn: () => void;
  onGuest: () => void;
}

const features = [
  {
    key: 'poker',
    emoji: '🃏',
    title: 'Planning Poker',
    desc: 'Estimate stories together — hidden votes, reveal, instant average & consensus.',
  },
  {
    key: 'retro',
    emoji: '🗂️',
    title: 'Retrospective',
    desc: 'Review last sprint’s action items, then capture What went well / to improve / actions.',
  },
  {
    key: 'whiteboard',
    emoji: '🎨',
    title: 'Whiteboard',
    desc: 'Infinite Miro-style canvas — sticky notes, shapes, pen sketches & diagrams.',
  },
];

export default function Landing({ onSignIn, onGuest }: Props) {
  return (
    <div className="landing">
      <div className="page-theme-toggle">
        <ThemeToggle />
      </div>
      <header className="landing-hero">
        <div className="brand brand-with-logo">
          <BrandLogo />
        </div>
        <p className="landing-tagline">Run your scrum ceremonies in one real-time room.</p>
        <p className="landing-sub">
          Planning poker, retrospectives and team chat — built for agile teams.
        </p>
        <div className="landing-cta">
          <button className="primary" onClick={onSignIn}>
            Log in / Register
          </button>
          <button className="ghost" onClick={onGuest}>
            Continue as guest →
          </button>
        </div>
      </header>

      <section className="landing-shots">
        {features.map((f) => (
          <figure key={f.key} className="landing-card">
            <div className={`landing-shot shot-${f.key}`} aria-hidden>
              <span>{f.emoji}</span>
            </div>
            <figcaption>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </figcaption>
          </figure>
        ))}
      </section>
    </div>
  );
}
