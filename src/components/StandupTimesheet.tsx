import { useEffect, useMemo, useState } from 'react';
import BrandLogo from './BrandLogo';

interface Task {
  project: string;
  task: string;
  hours: number;
}
interface DayEntry {
  summary: string;
  tasks: Task[];
}
type Store = Record<string, DayEntry>; 

const STORAGE_KEY = 'sprintdeck.standups';
const emptyDay = (): DayEntry => ({ summary: '', tasks: [] });

function loadStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Store;
  } catch {
    return {};
  }
}
function saveStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { void 0; }
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function mondayOf(d: Date): Date {
  const c = new Date(d);
  const dow = (c.getDay() + 6) % 7; 
  c.setDate(c.getDate() - dow);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
const WEEKDAYS = 5; 

interface Props {
  onBack?: () => void;
}

export default function StandupTimesheet({ onBack }: Props) {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [weekMonday, setWeekMonday] = useState<Date>(() => mondayOf(new Date()));
  const [copied, setCopied] = useState(false);

  useEffect(() => saveStore(store), [store]);

  const days = useMemo(
    () => Array.from({ length: WEEKDAYS }, (_, i) => addDays(weekMonday, i)),
    [weekMonday],
  );

  const dayOf = (iso: string): DayEntry => store[iso] ?? emptyDay();
  const dayHours = (e: DayEntry) => e.tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const weekHours = days.reduce((s, d) => s + dayHours(dayOf(toISO(d))), 0);

  function update(iso: string, mut: (e: DayEntry) => DayEntry) {
    setStore((prev) => {
      const next = { ...prev, [iso]: mut(prev[iso] ?? emptyDay()) };
      const e = next[iso];
      if (!e.summary && e.tasks.length === 0) delete next[iso]; 
      return next;
    });
  }
  const setSummary = (iso: string, summary: string) => update(iso, (e) => ({ ...e, summary }));
  const addTask = (iso: string) =>
    update(iso, (e) => ({ ...e, tasks: [...e.tasks, { project: '', task: '', hours: 0 }] }));
  const setTask = (iso: string, i: number, patch: Partial<Task>) =>
    update(iso, (e) => ({ ...e, tasks: e.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const removeTask = (iso: string, i: number) =>
    update(iso, (e) => ({ ...e, tasks: e.tasks.filter((_, j) => j !== i) }));

  function weeklyText(): string {
    const lines: string[] = [`Weekly report — week of ${toISO(weekMonday)}`, '='.repeat(40), ''];
    for (const d of days) {
      const iso = toISO(d);
      const e = dayOf(iso);
      if (!e.summary && e.tasks.length === 0) continue;
      lines.push(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
      if (e.summary) lines.push(`  ${e.summary}`);
      for (const t of e.tasks) {
        const bits = [t.project, t.task].filter(Boolean).join(' / ');
        lines.push(`  • ${bits || 'Task'} — ${t.hours || 0}h`);
      }
      lines.push('');
    }
    lines.push(`Total: ${weekHours}h`);
    return lines.join('\n');
  }

  async function copyForKeka() {
    try {
      await navigator.clipboard.writeText(weeklyText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy your weekly report:', weeklyText());
    }
  }

  function downloadCsv() {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: string[] = [['Date', 'Project', 'Task', 'Hours', 'Summary'].join(',')];
    for (const d of days) {
      const iso = toISO(d);
      const e = dayOf(iso);
      if (e.tasks.length === 0 && e.summary) {
        rows.push([iso, '', '', '', esc(e.summary)].join(','));
        continue;
      }
      for (const t of e.tasks) {
        rows.push([iso, esc(t.project), esc(t.task), Number(t.hours) || 0, esc(e.summary)].join(','));
      }
    }
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SprintDeck-timesheet-${toISO(weekMonday)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  
  
  function downloadJson() {
    const out: Store = {};
    for (const d of days) {
      const iso = toISO(d);
      const e = store[iso];
      if (e && (e.summary || e.tasks.length > 0)) out[iso] = e;
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `week-${toISO(weekMonday)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const weekLabel = `${weekMonday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(
    weekMonday,
    WEEKDAYS - 1,
  ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="stx">
      <style>{STYLES}</style>

      <header className="stx-head">
        <div className="stx-title">
          <BrandLogo variant="mark" className="stx-mark-img" />
          <h1>Daily Scrum &amp; Timesheet</h1>
        </div>
        {onBack && (
          <button className="stx-btn" onClick={onBack}>
            ← Back
          </button>
        )}
      </header>

      <div className="stx-weekbar">
        <button className="stx-btn" onClick={() => setWeekMonday((w) => addDays(w, -7))} aria-label="Previous week">
          ‹
        </button>
        <div className="stx-weeklabel">
          {weekLabel}
          <span className="stx-weektotal">{weekHours}h this week</span>
        </div>
        <button className="stx-btn" onClick={() => setWeekMonday((w) => addDays(w, 7))} aria-label="Next week">
          ›
        </button>
        <button className="stx-btn stx-today" onClick={() => setWeekMonday(mondayOf(new Date()))}>
          Today
        </button>
      </div>

      <div className="stx-days">
        {days.map((d) => {
          const iso = toISO(d);
          const e = dayOf(iso);
          return (
            <section className="stx-day" key={iso}>
              <div className="stx-day-head">
                <span className="stx-day-name">
                  {d.toLocaleDateString(undefined, { weekday: 'long' })}
                </span>
                <span className="stx-day-date">
                  {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span className="stx-day-total">{dayHours(e)}h</span>
              </div>

              <textarea
                className="stx-summary"
                placeholder="Standup update — what you did / are doing, any blockers…"
                rows={2}
                value={e.summary}
                onChange={(ev) => setSummary(iso, ev.target.value)}
              />

              {e.tasks.map((t, i) => (
                <div className="stx-task" key={i}>
                  <input
                    className="stx-in"
                    placeholder="Project"
                    value={t.project}
                    onChange={(ev) => setTask(iso, i, { project: ev.target.value })}
                  />
                  <input
                    className="stx-in stx-in-task"
                    placeholder="Task / ticket"
                    value={t.task}
                    onChange={(ev) => setTask(iso, i, { task: ev.target.value })}
                  />
                  <input
                    className="stx-in stx-in-hours"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    placeholder="0"
                    value={t.hours === 0 ? '' : t.hours}
                    onChange={(ev) => setTask(iso, i, { hours: Math.max(0, Math.min(24, Number(ev.target.value) || 0)) })}
                  />
                  <button className="stx-x" title="Remove" onClick={() => removeTask(iso, i)}>
                    ×
                  </button>
                </div>
              ))}

              <button className="stx-add" onClick={() => addTask(iso)}>
                + Add task
              </button>
            </section>
          );
        })}
      </div>

      <footer className="stx-actions">
        <button className="stx-btn stx-primary" onClick={copyForKeka}>
          {copied ? 'Copied!' : 'Copy for Keka'}
        </button>
        <button className="stx-btn" onClick={downloadCsv}>
          Download CSV
        </button>
        <button className="stx-btn" onClick={downloadJson} title="For the local Playwright filler (keyless SSO push to Techraq / Keka)">
          Download JSON
        </button>
        <button
          className="stx-btn"
          disabled
          title="Auto-push needs a Keka / timesheets write API + org approval — not available yet."
        >
          Auto-sync to Keka / Timesheets (coming soon)
        </button>
      </footer>
    </div>
  );
}

const STYLES = `
.stx { max-width: 780px; margin: 0 auto; padding: 1.25rem; color: inherit; }
.stx-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.stx-title { display: flex; align-items: center; gap: 0.5rem; }
.stx-title h1 { font-size: 1.25rem; margin: 0; }
.stx-mark { color: #4f7cff; font-size: 1.3rem; }
.stx-mark-img { width: 1.6rem; height: 1.6rem; object-fit: contain; display: block; }
.stx-weekbar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
.stx-weeklabel { flex: 1; display: flex; flex-direction: column; align-items: center; font-weight: 600; }
.stx-weektotal { font-weight: 400; font-size: 0.8rem; opacity: 0.7; }
.stx-days { display: flex; flex-direction: column; gap: 0.75rem; }
.stx-day { border: 1px solid rgba(128,128,128,0.25); border-radius: 12px; padding: 0.75rem; }
.stx-day-head { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem; }
.stx-day-name { font-weight: 600; }
.stx-day-date { opacity: 0.6; font-size: 0.85rem; }
.stx-day-total { margin-left: auto; font-size: 0.85rem; opacity: 0.8; }
.stx-summary, .stx-in {
  width: 100%; background: rgba(128,128,128,0.08); color: inherit;
  border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; padding: 0.5rem; font: inherit;
}
.stx-summary { resize: vertical; margin-bottom: 0.5rem; }
.stx-task { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
.stx-in-task { flex: 1; }
.stx-in-hours { width: 4.5rem; text-align: right; }
.stx-x {
  border: none; background: transparent; color: #e05260; font-size: 1.2rem;
  cursor: pointer; padding: 0 0.4rem;
}
.stx-add {
  background: transparent; border: 1px dashed rgba(128,128,128,0.4); border-radius: 8px;
  color: inherit; padding: 0.4rem 0.6rem; cursor: pointer; font-size: 0.85rem; opacity: 0.85;
}
.stx-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.25rem; }
.stx-btn {
  background: rgba(128,128,128,0.12); color: inherit; border: 1px solid rgba(128,128,128,0.28);
  border-radius: 8px; padding: 0.5rem 0.85rem; cursor: pointer; font: inherit;
}
.stx-btn:hover:not(:disabled) { border-color: #4f7cff; }
.stx-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.stx-primary { background: linear-gradient(135deg, #4f7cff, #7c5cff); color: #fff; border-color: transparent; }
.stx-today { margin-left: 0.25rem; }
@media (max-width: 560px) {
  .stx-task { flex-wrap: wrap; }
  .stx-in-task { flex: 1 1 100%; }
}
`;
