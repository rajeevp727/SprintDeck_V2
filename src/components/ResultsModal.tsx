import type { HistoryEntry } from '../lib/types';
import { exportCsv, exportText, exportJson } from '../lib/export';
import { sessionAnalytics } from '../lib/analytics';

interface Props {
  sessionName: string;
  history: HistoryEntry[];
  onClose: () => void;
}

function cell(n: number | null) {
  return n === null ? '—' : n;
}

export default function ResultsModal({ sessionName, history, onClose }: Props) {
  const stats = sessionAnalytics(history);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Results history</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {stats.count > 0 && (
          <div className="session-summary">
            <div className="sum-stat"><b>{stats.totalPoints}</b><span>total points</span></div>
            <div className="sum-stat"><b>{stats.count}</b><span>estimated</span></div>
            <div className="sum-stat"><b>{stats.consensusRate}%</b><span>consensus</span></div>
            <div className="sum-stat"><b>{stats.avgSpread}</b><span>avg spread</span></div>
            <div className="sum-stat"><b>{stats.contested}</b><span>contested</span></div>
          </div>
        )}

        {history.length === 0 ? (
          <p className="muted modal-empty">No stories estimated yet. Reveal a story and click “Save &amp; next”.</p>
        ) : (
          <div className="table-scroll">
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Story</th>
                  <th>Avg</th>
                  <th>Median</th>
                  <th>Range</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id}>
                    <td>{i + 1}</td>
                    <td className="story-cell">{h.title}</td>
                    <td>{cell(h.average)}</td>
                    <td>{cell(h.median)}</td>
                    <td>
                      {cell(h.min)}–{cell(h.max)}
                    </td>
                    <td className="votes-cell">
                      {h.votes.map((v) => `${v.name}=${v.vote}`).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="modal-footer">
          <span className="muted">{history.length} estimated</span>
          <div className="export-buttons">
            <button
              className="ghost"
              disabled={history.length === 0}
              onClick={() => exportText(sessionName, history)}
            >
              Export .txt
            </button>
            <button
              className="ghost"
              disabled={history.length === 0}
              onClick={() => exportCsv(history)}
            >
              Export Excel (.csv)
            </button>
            <button
              className="ghost"
              disabled={history.length === 0}
              onClick={() => exportJson(sessionName, history)}
            >
              Export .json
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
