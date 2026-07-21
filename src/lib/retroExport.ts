import type { RetroBoard } from './retroTypes';

// Self-contained export for the retrospective (txt / csv / PDF-via-print). No
// external libraries — CSV opens in Excel, PDF is the browser's print dialog.
export type ExportFormat = 'txt' | 'csv' | 'pdf';

export const exportFormats: { format: ExportFormat; label: string }[] = [
  { format: 'txt', label: 'Text (.txt)' },
  { format: 'csv', label: 'CSV (.csv)' },
  { format: 'pdf', label: 'PDF' },
];

type Cell = string | number | null;
interface Table {
  title?: string;
  headers: string[];
  rows: Cell[][];
}
export interface ExportDoc {
  title: string;
  filename: string;
  tables: Table[];
}

function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const str = (c: Cell) => (c === null || c === undefined ? '' : String(c));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toText(doc: ExportDoc): string {
  const out: string[] = [doc.title, '='.repeat(Math.min(doc.title.length, 60)), ''];
  for (const t of doc.tables) {
    if (t.title) out.push(t.title, '-'.repeat(t.title.length));
    if (!t.rows.length) {
      out.push('(none)', '');
      continue;
    }
    for (const row of t.rows) out.push(row.map(str).join('  |  '));
    out.push('');
  }
  return out.join('\n');
}

function csvCell(c: Cell): string {
  const s = str(c);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(doc: ExportDoc): string {
  const lines: string[] = [];
  doc.tables.forEach((t, i) => {
    if (i > 0) lines.push('');
    if (t.title) lines.push(csvCell(t.title));
    lines.push(t.headers.map(csvCell).join(','));
    for (const row of t.rows) lines.push(row.map(csvCell).join(','));
  });
  return '﻿' + lines.join('\r\n'); // BOM so Excel detects UTF-8
}

function printPdf(doc: ExportDoc) {
  const w = window.open('', '_blank');
  if (!w) return;
  const tables = doc.tables
    .map((t) => {
      const head = `<tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
      const body = t.rows.length
        ? t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(str(c))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${t.headers.length}">(none)</td></tr>`;
      return `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
    })
    .join('');
  w.document.write(
    `<html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>` +
      'body{font-family:Segoe UI,system-ui,sans-serif;color:#111;margin:2rem}' +
      'h2{margin:0 0 1rem}h3{margin:1.2rem 0 .4rem}' +
      'table{border-collapse:collapse;width:100%;margin-bottom:1rem}' +
      'td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px}th{background:#f2f2f2}' +
      `</style></head><body><h2>${esc(doc.title)}</h2>${tables}` +
      '<script>window.onload=function(){window.print()}<\/script></body></html>',
  );
  w.document.close();
  w.focus();
}

export function exportDoc(format: ExportFormat, doc: ExportDoc) {
  if (format === 'txt') return download(toText(doc), `${doc.filename}.txt`, 'text/plain;charset=utf-8');
  if (format === 'csv') return download(toCsv(doc), `${doc.filename}.csv`, 'text/csv;charset=utf-8');
  return printPdf(doc);
}

function slug(s: string): string {
  return (s || 'retro').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'retro';
}

export function retroExportDoc(board: RetroBoard): ExportDoc {
  const tables: Table[] = [];
  if (board.carryOverItems?.length) {
    tables.push({
      title: 'Carried-over action items (reviewed)',
      headers: ['#', 'Item', 'Done'],
      rows: board.carryOverItems.map((it, i) => [i + 1, it.text, it.done ? 'Yes' : 'No']),
    });
  }
  for (const col of board.columns) {
    tables.push({
      title: col.title,
      headers: ['#', 'Note', 'Author'],
      rows: board.notes.filter((n) => n.columnId === col.id).map((n, i) => [i + 1, n.text, n.authorName]),
    });
  }
  return { title: `SprintDeck — Retrospective — ${board.name}`, filename: slug(board.name), tables };
}
