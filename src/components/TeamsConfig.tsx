import { useEffect, useState } from 'react';
import { pages } from '@microsoft/teams-js';
import { initTeams } from '../lib/teams';
import BrandLogo from './BrandLogo';

type Surface = 'planning' | 'retro' | 'whiteboard';

const surfaces: { key: Surface; label: string; path: string; hint: string }[] = [
  { key: 'planning', label: 'Sprint Planning', path: '/', hint: 'Planning poker for this team' },
  { key: 'retro', label: 'Retrospective', path: '/retro-new', hint: 'Start or join a retro board' },
  { key: 'whiteboard', label: 'Whiteboard', path: '/whiteboard', hint: 'Shared canvas' },
];

/**
 * The screen Teams shows when someone adds SprintDeck to a channel or chat.
 * It picks which ceremony the tab opens on and hands the URL back to Teams.
 */
export default function TeamsConfig() {
  const [chosen, setChosen] = useState<Surface>('retro');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initTeams().then((ok) => setReady(ok));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const surface = surfaces.find((s) => s.key === chosen);
    if (!surface) return;

    pages.config.registerOnSaveHandler((event) => {
      pages.config
        .setConfig({
          entityId: `sprintdeck-${surface.key}`,
          contentUrl: `${location.origin}${surface.path}?teams=1`,
          websiteUrl: `${location.origin}${surface.path}`,
          suggestedDisplayName: surface.label,
        })
        .then(() => event.notifySuccess())
        .catch((err) => event.notifyFailure(String(err)));
    });
    pages.config.setValidityState(true);
  }, [ready, chosen]);

  return (
    <div className="home teams-config">
      <header className="brand">
        <BrandLogo variant="mark" />
        <h1>Add SprintDeck</h1>
      </header>
      <p className="tagline">Which ceremony should this tab open on?</p>

      <div className="card home-card">
        <div className="form">
          {surfaces.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`ghost teams-config-option${chosen === s.key ? ' chosen' : ''}`}
              onClick={() => setChosen(s.key)}
              aria-pressed={chosen === s.key}
            >
              <strong>{s.label}</strong>
              <span className="muted">{s.hint}</span>
            </button>
          ))}
          {!ready && (
            <p className="auth-hint">
              This page is meant to be opened by Microsoft Teams while adding the app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
