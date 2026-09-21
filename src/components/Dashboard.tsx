import BrandLogo from './BrandLogo';
import DeveloperCredit from './DeveloperCredit';
import ProfileMenu from './ProfileMenu';
import { useState } from 'react';
import ResumeRooms from './ResumeRooms';
import RetroHistory from './RetroHistory';
import ViewToggle, { useFeatureView } from './ViewToggle';
import type { ActiveRoom } from '../lib/auth';

interface Props {
  onPlanning: () => void;
  onRetro: () => void;
  onWhiteboard: () => void;
  onResume: (room: ActiveRoom) => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onSecurity: () => void;
}

export default function Dashboard({ onPlanning, onRetro, onWhiteboard, onResume, onPrivacy, onTerms, onSecurity }: Props) {
  const [view, setView] = useFeatureView();
  const [showHistory, setShowHistory] = useState(false);
  const ceremonies = [
    {
      key: 'planning',
      icon: '🃏',
      title: 'Sprint Planning',
      desc: 'Planning poker — estimate stories together with hidden votes, reveal & consensus.',
      cta: 'Start or join →',
      onOpen: onPlanning,
    },
    {
      key: 'retro',
      icon: '🗂️',
      title: 'Sprint Retrospective',
      desc: 'Review last sprint’s actions, then capture what went well, what to improve & next actions.',
      cta: 'Start or join →',
      onOpen: onRetro,
    },
    {
      key: 'whiteboard',
      icon: '🎨',
      title: 'Whiteboard',
      desc: 'Shared Miro-style canvas — live multiplayer, presenter write control, room-locked or shareable link.',
      cta: 'Open →',
      onOpen: onWhiteboard,
    },
  ];

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand brand-with-logo">
          <BrandLogo variant="mark" className="dash-brand-mark" />
          <span className="dash-brand-name">SprintDeck</span>
        </div>
        <div className="dash-head-actions">
          <ProfileMenu />
        </div>
      </header>

      <ResumeRooms onResume={onResume} />

      <div className="dash-lead-row">
        <p className="dash-lead">Choose a ceremony to run with your team.</p>
        <div className="dash-lead-actions">
          <button type="button" className="ghost dash-history-btn" onClick={() => setShowHistory(true)}>
            Past retrospectives
          </button>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {showHistory && <RetroHistory onClose={() => setShowHistory(false)} />}

      <div className={view === 'grid' ? 'dash-cards' : 'dash-rows'}>
        {ceremonies.map((c) => (
          <button key={c.key} className={view === 'grid' ? 'dash-card' : 'dash-row'} onClick={c.onOpen}>
            <span className="dash-card-icon" aria-hidden>{c.icon}</span>
            <span className="dash-card-title">{c.title}</span>
            <span className="dash-card-desc">{c.desc}</span>
            <span className="dash-card-cta">{c.cta}</span>
          </button>
        ))}
      </div>

      <footer className="dash-footer">
        <DeveloperCredit />
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
