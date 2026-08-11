import { useState } from 'react';
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
  {
    key: 'chat',
    emoji: '💬',
    title: 'Team Chat',
    desc: 'A members-only back-channel with replies & reactions — no separate call needed.',
  },
];

type FeatureView = 'grid' | 'list';

export default function Landing({ onSignIn, onGuest }: Props) {
  const [view, setView] = useState<FeatureView>('grid');

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
          Planning poker, retrospectives, whiteboard, and team chat — built for agile teams.
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

      <div className="landing-features-head">
        <h2 className="landing-features-title">What you can run</h2>
        <div className="landing-view-toggle" role="tablist" aria-label="Feature layout">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'grid'}
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setView('grid')}
          >
            Cards
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <section className="landing-shots" aria-label="Features">
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
      ) : (
        <section className="landing-list" aria-label="Features">
          {features.map((f) => (
            <article key={f.key} className={`landing-list-item shot-${f.key}`}>
              <span className="landing-list-icon" aria-hidden>
                {f.emoji}
              </span>
              <div className="landing-list-body">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      <p className="landing-footnote">
        Daily standup timesheet and full ceremony controls unlock after you log in or continue as guest.
      </p>
    </div>
  );
}
