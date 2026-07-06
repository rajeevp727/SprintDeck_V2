import type { HistoryEntry } from './types';

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const appName = 'SprintDeck';

function fmt(n: number | null) {
  return n === null ? '—' : String(n);
}

// Plain-text report.
export function exportText(sessionName: string, history: HistoryEntry[]) {
  const lines: string[] = [];
  lines.push(`SprintDeck results — ${sessionName}`);
  lines.push('='.repeat(40));
  lines.push('');
  history.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.title}`);
    lines.push(
      `   Average: ${fmt(h.average)}   Median: ${fmt(h.median)}   Range: ${fmt(h.min)}–${fmt(h.max)}   ${
        h.consensus ? 'Consensus ✓' : ''
      }`,
    );
    lines.push(`   Votes: ${h.votes.map((v) => `${v.name}=${v.vote}`).join(', ') || '—'}`);
    lines.push('');
  });
  if (history.length === 0) lines.push('(no estimates yet)');
  downloadBlob(lines.join('\n'), `${appName}.txt`, 'text/plain;charset=utf-8');
}

// CSV (opens in Excel). One row per story; individual votes joined in a column.
export function exportCsv(history: HistoryEntry[]) {
  const esc = (val: string | number | null) => {
    const s = val === null ? '' : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: string[] = [];
  rows.push(['#', 'Story', 'Average', 'Median', 'Min', 'Max', 'Consensus', 'Votes'].join(','));
  history.forEach((h, i) => {
    rows.push(
      [
        i + 1,
        esc(h.title),
        esc(h.average),
        esc(h.median),
        esc(h.min),
        esc(h.max),
        h.consensus ? 'Yes' : 'No',
        esc(h.votes.map((v) => `${v.name}=${v.vote}`).join('; ')),
      ].join(','),
    );
  });
  // BOM so Excel detects UTF-8 correctly.
  downloadBlob('﻿' + rows.join('\r\n'), `${appName}.csv`, 'text/csv;charset=utf-8');
}

// Full session data as JSON — for archival / data portability.
export function exportJson(sessionName: string, history: HistoryEntry[]) {
  const data = {
    app: appName,
    session: sessionName,
    exportedAt: new Date().toISOString(),
    rounds: history.map((h, i) => ({
      index: i + 1,
      title: h.title,
      identifier: h.identifier ?? null,
      average: h.average,
      median: h.median,
      min: h.min,
      max: h.max,
      consensus: h.consensus,
      pushedEstimate: h.pushedEstimate ?? null,
      votes: h.votes,
      at: h.at,
    })),
  };
  downloadBlob(JSON.stringify(data, null, 2), `${appName}.json`, 'application/json;charset=utf-8');
}
