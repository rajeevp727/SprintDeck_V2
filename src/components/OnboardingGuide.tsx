import { useState } from 'react';

interface Props {
  onPlanning: () => void;
  onRetro: () => void;
}

const storageKey = 'sprintdeck.onboarding.v1';
const steps = [
  { id: 'workspace', title: 'Create your organisation and first team', detail: 'Use Workspaces below to create your team space.' },
  { id: 'invite', title: 'Invite a teammate', detail: 'Invite at least one colleague so ceremonies are collaborative.' },
  { id: 'planning', title: 'Run your first Planning Poker session', detail: 'Estimate one real backlog item together.' },
  { id: 'retro', title: 'Complete a retrospective', detail: 'Capture actions, assign owners and agree on due dates.' },
];

function read(): string[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]; } catch { return []; }
}

export default function OnboardingGuide({ onPlanning, onRetro }: Props) {
  const [done, setDone] = useState<string[]>(read);
  const [dismissed, setDismissed] = useState(false);
  const complete = (id: string) => {
    const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id];
    setDone(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { void 0; }
  };
  if (dismissed) return <button className="ghost onboarding-reopen" onClick={() => setDismissed(false)}>Show getting-started guide</button>;
  return (
    <section className="onboarding-panel" aria-labelledby="onboarding-title">
      <div className="onboarding-head">
        <div><p className="workspace-eyebrow">YOUR FIRST SPRINT</p><h2 id="onboarding-title">Getting started</h2><p>A short path from setup to your first team improvement cycle.</p></div>
        <button type="button" className="ghost" onClick={() => setDismissed(true)}>Hide</button>
      </div>
      <div className="onboarding-progress"><span style={{ width: `${Math.round((done.length / steps.length) * 100)}%` }} /></div>
      <p className="onboarding-progress-label">{done.length} of {steps.length} steps completed</p>
      <ol className="onboarding-steps">
        {steps.map((step) => (
          <li key={step.id} className={done.includes(step.id) ? 'complete' : ''}>
            <label><input type="checkbox" checked={done.includes(step.id)} onChange={() => complete(step.id)} /><span><strong>{step.title}</strong><small>{step.detail}</small></span></label>
            {step.id === 'planning' && <button type="button" className="ghost" onClick={onPlanning}>Start planning</button>}
            {step.id === 'retro' && <button type="button" className="ghost" onClick={onRetro}>Start retro</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
