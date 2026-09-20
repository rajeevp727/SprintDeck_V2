import { useRef, useState } from 'react';
import type { RetroBoard as RetroBoardType, RetroColumn } from '../lib/retroTypes';
import { hintSeen, markHintSeen } from '../lib/storage';
import RetroNote from './RetroNote';

interface ColumnProps {
  /** Voting has finished: members stop writing, the facilitator carries on. */
  votingOver: boolean;
  /** The clock is running: votes are accepted only in this window. */
  votingRunning: boolean;
  column: RetroColumn;
  board: RetroBoardType;
  participantId: string;
  isFacilitator: boolean;
  onAdd: (text: string) => void;
  onEdit: (noteId: string, text: string) => void;
  onDelete: (noteId: string) => void;
  onMove: (noteId: string, columnId: string) => void;
  onVote: (noteId: string) => void;
  onTyping: () => void;
}

export default function RetroColumnView({
  votingOver,
  votingRunning,
  column,
  board,
  participantId,
  isFacilitator,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  onVote,
  onTyping,
}: ColumnProps) {
  const [draft, setDraft] = useState('');
  const [showHint, setShowHint] = useState(false);
  const lastTyping = useRef(0);
  const actionColumn = board.columns.find((c) => /action items/i.test(c.title));
  const isActionColumn = actionColumn?.id === column.id;
  const live = board.phase !== 'ended';
  const ranked = votingOver && !isActionColumn;
  const canWrite = live && (isActionColumn ? isFacilitator : !isFacilitator && !votingOver);
  const notes = board.notes
    .filter((n) => n.columnId === column.id)
    .sort((a, b) => (ranked ? (b.voteCount ?? 0) - (a.voteCount ?? 0) : 0));

  /** Out of Action items goes back where it came from, or to the first column. */
  function moveTarget(note: (typeof notes)[number]): string {
    if (!isActionColumn) return actionColumn?.id ?? column.id;
    return note.previousColumnId ?? board.columns[0]?.id ?? column.id;
  }

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onAdd(text);
  }

  /** How the box works, shown once per column and not laboured after that. */
  function hintOnFirstHover() {
    const key = `retro-compose:${column.title}`;
    if (hintSeen(key)) return;
    markHintSeen(key);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 5000);
  }

  function handleChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      onTyping();
    }
  }

  return (
    <div className="retro-col">
      <div className="retro-col-head" style={{ borderColor: column.color }}>
        <span className="retro-col-title">{column.title}</span>
        <span className="retro-col-count">{notes.length}</span>
      </div>

      {canWrite && (
        <div className="retro-col-add">
          <textarea
            value={draft}
            placeholder="Add your thoughts on this…"
            rows={2}
            maxLength={500}
            onMouseEnter={hintOnFirstHover}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add();
              }
              if (e.key === 'Escape') setDraft('');
            }}
          />
          {showHint && (
            <span className="retro-col-hint" role="status">
              Enter or click away to post · Esc to discard
            </span>
          )}
        </div>
      )}

      <div className="retro-col-notes">
        {notes.map((n) => (
          <RetroNote
            key={n.id}
            note={n}
            canEdit={live && (isActionColumn ? isFacilitator : n.authorId === participantId && !votingOver)}
            canDelete={live && n.authorId === participantId && (isActionColumn || !votingOver)}
            canMove={live && !!actionColumn && isFacilitator && votingOver}
            isAction={isActionColumn}
            canVote={live && !isActionColumn && votingRunning && n.authorId !== participantId}
            onEdit={(text) => onEdit(n.id, text)}
            onDelete={() => onDelete(n.id)}
            onMove={() => onMove(n.id, moveTarget(n))}
            onVote={() => onVote(n.id)}
          />
        ))}
      </div>
    </div>
  );
}
