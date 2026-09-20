import type { RetroBoard as RetroBoardType } from '../lib/retroTypes';

interface ReviewProps {
  board: RetroBoardType;
  isFacilitator: boolean;
  onToggle: (itemId: string) => void;
  onLike: (itemId: string) => void;
  onOpen: () => void;
}

export default function ReviewPanel({ board, isFacilitator, onToggle, onLike, onOpen }: ReviewProps) {
  const items = board.carryOverItems;
  return (
    <div className="retro-review">
      <h3 className="retro-review-title">Last sprint's action items</h3>
      {items.length === 0 ? (
        <p className="retro-review-empty">
          You're all caught up — no action items carried over from your last retrospective.
        </p>
      ) : (
        <ul className="retro-review-list">
          {items.map((it) => (
            <li key={it.id} className={it.done ? 'done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={it.done}
                  disabled={!isFacilitator}
                  onChange={() => onToggle(it.id)}
                />
                <span>{it.text}</span>
              </label>
              <button
                type="button"
                className={`retro-review-like${it.likedByMe ? ' liked' : ''}`}
                onClick={() => onLike(it.id)}
                title={it.likedByMe ? 'Remove your like' : 'This still matters'}
                aria-pressed={!!it.likedByMe}
              >
                <span aria-hidden>{'👍'}</span>
                <span>{it.likeCount ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isFacilitator ? (
        <button className="primary" onClick={onOpen}>
          Start retrospective
        </button>
      ) : (
        <p className="muted retro-review-wait">
          The facilitator is reviewing last sprint's action items…
        </p>
      )}
    </div>
  );
}
