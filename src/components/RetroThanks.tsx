import { useEffect, useState } from 'react';

interface Props {
  boardName: string;
  actionCount: number;
  seconds?: number;
  onLeave: () => void;
}

/**
 * Shown to members once the facilitator ends the board. The retrospective is
 * over, so the room closes itself rather than leaving people on a dead page.
 */
export default function RetroThanks({ boardName, actionCount, seconds = 8, onLeave }: Props) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const tick = setInterval(() => setLeft((n) => n - 1), 1000);
    const done = setTimeout(onLeave, seconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [seconds, onLeave]);

  return (
    <div className="retro-thanks">
      <div className="retro-thanks-card">
        <span className="retro-thanks-mark" aria-hidden>
          🎉
        </span>
        <h2>Thanks for taking part</h2>
        <p className="auth-hint">
          {boardName} has ended.{' '}
          {actionCount > 0
            ? `The team agreed ${actionCount} action item${actionCount === 1 ? '' : 's'} — your facilitator has the record.`
            : 'Your facilitator has the record of what was discussed.'}
        </p>
        <button type="button" className="primary" onClick={onLeave}>
          Close {left > 0 ? `(${left})` : ''}
        </button>
      </div>
    </div>
  );
}
