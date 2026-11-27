import { useState, type FormEvent } from 'react';
import type { RetroBoard as RetroBoardType, RetroCarryItem } from '../lib/retroTypes';

type ActionPatch = {
  ownerId?: string | null;
  dueDate?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'in-progress' | 'blocked' | 'done';
};

interface ReviewProps {
  board: RetroBoardType;
  isFacilitator: boolean;
  onToggle: (itemId: string) => void;
  onLike: (itemId: string) => void;
  onUpdate: (itemId: string, patch: ActionPatch) => void;
  onComment: (itemId: string, text: string) => void;
  onOpen: () => void;
}

function ActionDetails({ item, board, editable, onUpdate, onComment }: {
  item: RetroCarryItem;
  board: RetroBoardType;
  editable: boolean;
  onUpdate: (patch: ActionPatch) => void;
  onComment: (text: string) => void;
}) {
  const [comment, setComment] = useState('');
  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    onComment(comment.trim());
    setComment('');
  }
  const status = item.status || (item.done ? 'done' : 'open');
  return (
    <div className="retro-action-details">
      <label>
        <span>Owner</span>
        <select value={item.ownerId || ''} disabled={!editable} onChange={(e) => onUpdate({ ownerId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {item.ownerId && !board.participants.some((person) => person.id === item.ownerId) && (
            <option value={item.ownerId}>{item.ownerName || 'Previous assignee'} (previous sprint)</option>
          )}
          {board.participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label>
        <span>Due date</span>
        <input type="date" value={item.dueDate || ''} disabled={!editable} onChange={(e) => onUpdate({ dueDate: e.target.value || null })} />
      </label>
      <label>
        <span>Priority</span>
        <select value={item.priority || 'medium'} disabled={!editable} onChange={(e) => onUpdate({ priority: e.target.value as ActionPatch['priority'] })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label>
        <span>Status</span>
        <select value={status} disabled={!editable} onChange={(e) => onUpdate({ status: e.target.value as ActionPatch['status'] })}>
          <option value="open">Open</option>
          <option value="in-progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done">Done</option>
        </select>
      </label>
      <div className="retro-action-discussion">
        <span>Comments ({item.comments?.length || 0})</span>
        {(item.comments || []).map((entry) => <p key={entry.id}><strong>{entry.authorName}</strong> {entry.text}</p>)}
        <form onSubmit={submitComment}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add an update or blocker…" maxLength={1000} />
          <button type="submit" className="ghost" disabled={!comment.trim()}>Comment</button>
        </form>
        {(item.history || []).length > 0 && <details><summary>Status history</summary>{item.history?.map((entry, index) => <p key={index}>{entry.changedBy}: {entry.from} → {entry.to}</p>)}</details>}
      </div>
    </div>
  );
}

export default function ReviewPanel({ board, isFacilitator, onToggle, onLike, onUpdate, onComment, onOpen }: ReviewProps) {
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
              <div className="retro-review-main">
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
              </div>
              <ActionDetails item={it} board={board} editable={isFacilitator} onUpdate={(patch) => onUpdate(it.id, patch)} onComment={(text) => onComment(it.id, text)} />
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
