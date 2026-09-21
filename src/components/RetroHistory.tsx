import { useEffect, useState } from 'react';
import { getToken } from '../lib/auth';
import { CloseIcon } from './icons';

interface ArchivedNote {
  id: string;
  columnId: string;
  text: string;
  author: string;
  voteCount: number;
}

interface Archive {
  id: string;
  name: string;
  boardCode?: string;
  code?: string;
  endedAt: number;
  noteCount?: number;
  participants?: number | string[];
  columns?: { id: string; title: string; color: string | null }[];
  notes?: ArchivedNote[];
}

interface Props {
  onClose: () => void;
}

async function fetchHistory(id?: string): Promise<{ retros?: Archive[]; retro?: Archive }> {
  const token = getToken();
  if (!token) return {};
  const query = id ? `?id=${encodeURIComponent(id)}` : '';
  const res = await fetch(`/api/retro-history${query}`, {
    cache: 'no-store',
    headers: { 'x-auth-token': token },
  });
  if (!res.ok) throw new Error('Could not load your retrospectives');
  return res.json();
}

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Past retrospectives this account hosted, read-only. */
export default function RetroHistory({ onClose }: Props) {
  const [list, setList] = useState<Archive[] | null>(null);
  const [open, setOpen] = useState<Archive | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistory()
      .then((data) => setList(data.retros ?? []))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function show(id: string) {
    try {
      const data = await fetchHistory(id);
      if (data.retro) setOpen(data.retro);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="retro-history" role="dialog" aria-modal="true" aria-label="Past retrospectives">
      <div className="retro-history-inner">
        <div className="retro-history-head">
          <strong>{open ? open.name : 'Past retrospectives'}</strong>
          <button
            type="button"
            className="auth-close auth-close-square"
            onClick={open ? () => setOpen(null) : onClose}
            aria-label={open ? 'Back to the list' : 'Close'}
            title={open ? 'Back' : 'Close'}
          >
            {open ? <span aria-hidden>←</span> : <CloseIcon />}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {!error && list === null && <p className="auth-hint">Loading…</p>}
        {!error && list?.length === 0 && (
          <p className="auth-hint">
            Nothing here yet — a retrospective is kept once you end it from the board.
          </p>
        )}

        {open ? <ArchiveDetail retro={open} /> : <ArchiveList list={list ?? []} onOpen={show} />}
      </div>
    </div>
  );
}

function ArchiveList({ list, onOpen }: { list: Archive[]; onOpen: (id: string) => void }) {
  if (list.length === 0) return null;
  return (
    <ul className="retro-history-list">
      {list.map((a) => (
        <li key={a.id}>
          <button type="button" className="ghost retro-history-item" onClick={() => onOpen(a.id)}>
            <span className="retro-history-name">{a.name}</span>
            <span className="retro-history-meta">
              {when(a.endedAt)} · {a.noteCount ?? 0} notes
              {a.boardCode ? ` · ${a.boardCode}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArchiveDetail({ retro }: { retro: Archive }) {
  const notes = retro.notes ?? [];
  return (
    <div className="retro-history-detail">
      <p className="auth-hint">{when(retro.endedAt)}</p>
      {(retro.columns ?? []).map((column) => {
        const own = notes
          .filter((n) => n.columnId === column.id)
          .sort((a, b) => b.voteCount - a.voteCount);
        if (own.length === 0) return null;
        return (
          <section key={column.id} className="retro-history-col">
            <h4 style={{ borderColor: column.color ?? undefined }}>{column.title}</h4>
            <ul>
              {own.map((n) => (
                <li key={n.id}>
                  <span>{n.text}</span>
                  <span className="retro-history-note-meta">
                    {n.author}
                    {n.voteCount > 0 ? ` · ${n.voteCount} vote${n.voteCount === 1 ? '' : 's'}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
