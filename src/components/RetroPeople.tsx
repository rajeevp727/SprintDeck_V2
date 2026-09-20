import type { RetroBoard as RetroBoardType } from '../lib/retroTypes';

interface Props {
  board: RetroBoardType;
  participantId: string;
  isFacilitator: boolean;
  onClose: () => void;
  onRemove: (targetId: string) => void;
}

/** Who is in the board. Anyone may look; only the facilitator may remove. */
export default function RetroPeople({ board, participantId, isFacilitator, onClose, onRemove }: Props) {
  const canRemove = isFacilitator && board.phase !== 'ended';

  return (
    <div className="retro-people" role="dialog" aria-label="People in this board">
      <div className="retro-people-head">
        <strong>In this board</strong>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="retro-people-list">
        {board.participants.map((p) => (
          <li key={p.id}>
            <span className="retro-legend-dot" style={{ background: p.color }} />
            <span className="retro-people-name">
              {p.name}
              {p.isFacilitator && <span className="crown"> ★</span>}
              {p.id === participantId && <span className="you"> (you)</span>}
            </span>
            {canRemove && !p.isFacilitator && (
              <button
                type="button"
                className="ghost danger retro-people-remove"
                title={`Remove ${p.name} from the board`}
                onClick={() => onRemove(p.id)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
