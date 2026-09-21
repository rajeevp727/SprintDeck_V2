import { useState } from 'react';
import type { RetroNote as RetroNoteType } from '../lib/retroTypes';

interface Props {
  note: RetroNoteType;
  canEdit: boolean;
  canDelete: boolean;
  /** Author or facilitator may gather a note into Action items, or send it back. */
  canMove: boolean;
  isAction: boolean;
  canVote: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onMove: () => void;
  onVote: () => void;
}

export default function RetroNote({
  note,
  canEdit,
  canDelete,
  canMove,
  isAction,
  canVote,
  onEdit,
  onDelete,
  onMove,
  onVote,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const votes = note.voteCount ?? 0;

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== note.text) onEdit(next);
    else setDraft(note.text);
  }

  return (
    <div className="retro-note" style={{ background: note.color }}>
      {editing ? (
        <textarea
          className="retro-note-edit"
          value={draft}
          autoFocus
          rows={3}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setDraft(note.text);
              setEditing(false);
            }
          }}
        />
      ) : note.hidden ? (
        <p className="retro-note-text retro-note-masked" title="Hidden until the facilitator reveals">
          ▪▪▪▪▪▪▪▪▪
        </p>
      ) : (
        <p
          className="retro-note-text"
          onClick={() => canEdit && setEditing(true)}
          title={canEdit ? 'Click to edit' : undefined}
        >
          {note.text}
        </p>
      )}

      <div className="retro-note-foot">
        <span className="retro-note-author">{note.authorName}</span>

        <span className="retro-note-actions">
          {canVote && (
            <button
              type="button"
              className={`retro-note-vote${note.votedByMe ? ' voted' : ''}`}
              onClick={onVote}
              title={note.votedByMe ? 'Remove your vote' : 'Vote for this'}
              aria-pressed={!!note.votedByMe}
            >
              ▲ {votes}
            </button>
          )}
          {!canVote && votes > 0 && <span className="retro-note-vote static">▲ {votes}</span>}

          {canMove && (
            <button
              type="button"
              className="retro-note-move"
              onClick={onMove}
              title={isAction ? 'Move back out of Action items' : 'Make this an action item'}
            >
              {isAction ? '↩' : '→ Action'}
            </button>
          )}

          {canDelete && (
            <button className="retro-note-del" title="Delete note" onClick={onDelete}>
              ×
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
