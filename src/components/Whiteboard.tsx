import { useCallback, useEffect, useRef, useState } from 'react';
import { whiteboardApi } from '../lib/whiteboardApi';
import { useRealtime } from '../lib/realtime';
import { clearIdentity, getIdentity } from '../lib/storage';
import type { WhiteboardElement, WhiteboardState } from '../lib/whiteboardTypes';
import { downloadText, elementsToSvg, exportBoardPdf, importSvgToElements } from '../lib/whiteboardExport';

type Tool = 'select' | 'hand' | 'sticky' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'pen' | 'text' | 'eraser' | 'frame';
type Point = { x: number; y: number };

const COLORS = ['#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const STICKY_COLORS = ['#fef08a', '#fdba74', '#86efac', '#93c5fd', '#d8b4fe', '#fda4af'];
const SIZES = [2, 4, 8, 14];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const PRESENCE_MS = 400;
const POLL_MS = 1500;

interface Props {
  code: string;
  onLeave: () => void;
  onMissingIdentity: () => void;
}

export default function Whiteboard({ code, onLeave, onMissingIdentity }: Props) {
  const identity = getIdentity(code);
  const participantId = identity?.participantId || '';
  const myName = identity?.name || 'You';

  const [board, setBoard] = useState<WhiteboardState | null>(null);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#111827');
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  const [size, setSize] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<WhiteboardElement> | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [following, setFollowing] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<WhiteboardState | null>(null);
  const viewportLocal = useRef({ x: 0, y: 0, zoom: 1 });
  const [, bump] = useState(0);
  const presenceTimer = useRef<number | undefined>();
  const dragRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { mode: 'move'; id: string; ox: number; oy: number }
    | { mode: 'draw'; start: Point }
    | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  boardRef.current = board;
  const effectiveTool: Tool = spaceDown ? 'hand' : tool;
  const canWrite = !!board?.canWrite && board.phase === 'active';
  const isPresenter = !!board?.isFacilitator;

  const applyBoard = useCallback((next: WhiteboardState) => {
    setBoard(next);
    boardRef.current = next;
    // Follow presenter viewport when enabled
    if (next.followPresenter && following && !next.isFacilitator && next.viewport) {
      viewportLocal.current = { ...next.viewport };
      bump((n) => n + 1);
    }
  }, [following]);

  const refresh = useCallback(async () => {
    if (!participantId) return;
    try {
      const res = await whiteboardApi.getBoard(code, participantId);
      applyBoard(res.whiteboard);
      setError('');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to load';
      if (/not in this whiteboard|not found/i.test(msg)) {
        clearIdentity(code);
        onMissingIdentity();
        return;
      }
      setError(msg);
    }
  }, [code, participantId, applyBoard, onMissingIdentity]);

  useEffect(() => {
    if (!participantId) {
      onMissingIdentity();
      return;
    }
    refresh();
  }, [participantId, refresh, onMissingIdentity]);

  const onRealtime = useCallback(
    (data: unknown) => {
      const msg = data as { t?: string };
      if (msg?.t === 'presence') return; // presence comes via refresh payload
      refresh();
    },
    [refresh],
  );

  const { connected, send } = useRealtime(`whiteboard:${code}`, participantId, onRealtime);

  useEffect(() => {
    if (connected) return;
    const id = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connected, refresh]);

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    const v = viewportLocal.current;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - v.x) / v.zoom,
      y: (clientY - rect.top - v.y) / v.zoom,
    };
  }, []);

  const queuePresence = useCallback(
    (world: Point, editing: string | null = editingId) => {
      if (!participantId) return;
      window.clearTimeout(presenceTimer.current);
      presenceTimer.current = window.setTimeout(() => {
        whiteboardApi
          .setPresence(code, participantId, { x: world.x, y: world.y, tool, editingId: editing })
          .then((res) => applyBoard(res.whiteboard))
          .catch(() => undefined);
        send({ t: 'presence', id: participantId, x: world.x, y: world.y, name: myName });
      }, PRESENCE_MS);
    },
    [code, participantId, tool, editingId, applyBoard, send, myName],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceDown(true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && canWrite) {
        e.preventDefault();
        whiteboardApi.deleteElement(code, participantId, selectedId).then((r) => applyBoard(r.whiteboard));
        setSelectedId(null);
      }
      const map: Record<string, Tool> = {
        v: 'select',
        h: 'hand',
        n: 'sticky',
        p: 'pen',
        t: 'text',
        r: 'rect',
        o: 'ellipse',
        a: 'arrow',
        l: 'line',
        e: 'eraser',
        f: 'frame',
      };
      const k = e.key.toLowerCase();
      if (map[k]) setTool(map[k]);
      if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        setDraft(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [selectedId, canWrite, code, participantId, applyBoard]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (board?.followPresenter && following && !isPresenter) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const v = viewportLocal.current;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
    const wx = (mx - v.x) / v.zoom;
    const wy = (my - v.y) / v.zoom;
    viewportLocal.current = { zoom, x: mx - wx * zoom, y: my - wy * zoom };
    bump((n) => n + 1);
    if (isPresenter) {
      whiteboardApi.setViewport(code, participantId, viewportLocal.current).catch(() => undefined);
    }
  };

  async function commitElement(el: Partial<WhiteboardElement>) {
    if (!canWrite) return;
    const res = await whiteboardApi.addElement(code, participantId, el);
    applyBoard(res.whiteboard);
    if (res.element) setSelectedId(res.element.id);
  }

  async function patchElement(id: string, patch: Partial<WhiteboardElement>) {
    if (!canWrite) return;
    const res = await whiteboardApi.updateElement(code, participantId, id, patch);
    applyBoard(res.whiteboard);
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    queuePresence(world);

    if (e.button === 1 || effectiveTool === 'hand') {
      if (board?.followPresenter && following && !isPresenter) return;
      dragRef.current = {
        mode: 'pan',
        sx: e.clientX,
        sy: e.clientY,
        vx: viewportLocal.current.x,
        vy: viewportLocal.current.y,
      };
      return;
    }

    if (!canWrite && effectiveTool !== 'select') {
      setError('Read-only — ask the presenter for write access');
      return;
    }

    if (effectiveTool === 'select') {
      const hit = [...(board?.elements || [])].reverse().find((el) => hitTest(el, world.x, world.y));
      setSelectedId(hit?.id ?? null);
      if (hit && canWrite && hit.type !== 'pen' && hit.type !== 'eraser') {
        dragRef.current = { mode: 'move', id: hit.id, ox: world.x - (hit.x || 0), oy: world.y - (hit.y || 0) };
      }
      return;
    }

    if (effectiveTool === 'sticky') {
      commitElement({
        type: 'sticky',
        color: stickyColor,
        x: world.x - 70,
        y: world.y - 70,
        w: 160,
        h: 160,
        text: '',
        size: 14,
      }).then(() => {
        /* editing starts after refresh via double-click */
      });
      setTool('select');
      return;
    }

    if (effectiveTool === 'text') {
      commitElement({
        type: 'text',
        color,
        size: Math.max(16, size * 4),
        x: world.x,
        y: world.y,
        text: 'Text',
      });
      setTool('select');
      return;
    }

    if (effectiveTool === 'pen' || effectiveTool === 'eraser') {
      setDraft({ type: effectiveTool, color, size, points: [world] });
      dragRef.current = { mode: 'draw', start: world };
      return;
    }

    if (['rect', 'ellipse', 'arrow', 'line', 'frame'].includes(effectiveTool)) {
      setDraft({ type: effectiveTool, color, size, x: world.x, y: world.y, w: 0, h: 0 });
      dragRef.current = { mode: 'draw', start: world };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    queuePresence(world);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === 'pan') {
      viewportLocal.current = {
        ...viewportLocal.current,
        x: drag.vx + (e.clientX - drag.sx),
        y: drag.vy + (e.clientY - drag.sy),
      };
      bump((n) => n + 1);
      return;
    }

    if (drag.mode === 'move' && board) {
      setBoard({
        ...board,
        elements: board.elements.map((el) =>
          el.id === drag.id ? { ...el, x: world.x - drag.ox, y: world.y - drag.oy } : el,
        ),
      });
      return;
    }

    if (drag.mode === 'draw' && draft) {
      if (draft.type === 'pen' || draft.type === 'eraser') {
        setDraft({ ...draft, points: [...(draft.points || []), world] });
      } else if (draft.type === 'rect' || draft.type === 'ellipse' || draft.type === 'frame') {
        setDraft({
          ...draft,
          x: Math.min(drag.start.x, world.x),
          y: Math.min(drag.start.y, world.y),
          w: Math.abs(world.x - drag.start.x),
          h: Math.abs(world.y - drag.start.y),
        });
      } else {
        setDraft({
          ...draft,
          x: drag.start.x,
          y: drag.start.y,
          w: world.x - drag.start.x,
          h: world.y - drag.start.y,
        });
      }
    }
  };

  const onPointerUp = async () => {
    const drag = dragRef.current;
    if (drag?.mode === 'move' && selectedId && board) {
      const el = board.elements.find((e) => e.id === selectedId);
      if (el) await patchElement(selectedId, { x: el.x, y: el.y });
    }
    if (drag?.mode === 'pan' && isPresenter) {
      whiteboardApi.setViewport(code, participantId, viewportLocal.current).catch(() => undefined);
    }
    if (drag?.mode === 'draw' && draft) {
      const tooSmall =
        (draft.type === 'rect' || draft.type === 'ellipse' || draft.type === 'frame') &&
        (draft.w || 0) < 4 &&
        (draft.h || 0) < 4;
      const emptyPen = (draft.type === 'pen' || draft.type === 'eraser') && (draft.points?.length || 0) < 2;
      if (!tooSmall && !emptyPen) await commitElement(draft);
      setDraft(null);
    }
    dragRef.current = null;
  };

  async function toggleWriter(targetId: string, allow: boolean) {
    const res = await whiteboardApi.setWriter(code, participantId, targetId, allow);
    applyBoard(res.whiteboard);
  }

  async function toggleShare(enable: boolean) {
    const res = await whiteboardApi.setShare(code, participantId, enable);
    applyBoard(res.whiteboard);
    if (enable && res.whiteboard.shareToken) {
      const url = `${window.location.origin}/whiteboard/${code}?t=${res.whiteboard.shareToken}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  async function toggleFollowMode(enabled: boolean) {
    const res = await whiteboardApi.setFollow(code, participantId, enabled);
    applyBoard(res.whiteboard);
  }

  function exportSvg() {
    if (!board) return;
    const svg = elementsToSvg(board.elements, viewportLocal.current);
    downloadText(`whiteboard-${code}.svg`, svg, 'image/svg+xml');
  }

  async function exportPdf() {
    if (!board) return;
    await exportBoardPdf(board.elements, viewportLocal.current, `whiteboard-${code}.pdf`);
  }

  async function onImportFile(file: File) {
    if (!canWrite) return;
    const text = await file.text();
    const imported = importSvgToElements(text);
    for (const el of imported.slice(0, 200)) {
      await whiteboardApi.addElement(code, participantId, el);
    }
    await refresh();
  }

  const v = viewportLocal.current;
  const elements = draft && board ? [...board.elements, draft as WhiteboardElement] : board?.elements || [];
  const cursor =
    effectiveTool === 'hand' ? 'grab' : effectiveTool === 'select' ? 'default' : 'crosshair';

  if (!board) {
    return (
      <div className="miro">
        <div className="miro-hint">{error || 'Loading whiteboard…'}</div>
      </div>
    );
  }

  return (
    <div className="miro">
      <header className="miro-top">
        <div className="miro-top-left">
          <button type="button" className="miro-back" onClick={onLeave} aria-label="Back">
            ←
          </button>
          <div className="miro-brand">
            <strong>{board.name}</strong>
            <span>
              {code} · {connected ? 'Live' : 'Polling'} · {canWrite ? 'Can edit' : 'View only'}
              {board.roomCode ? ` · Room ${board.roomCode}` : ''}
            </span>
          </div>
        </div>
        <div className="miro-top-actions">
          {!isPresenter && board.followPresenter ? (
            <button type="button" className={`miro-chip${following ? ' active-chip' : ''}`} onClick={() => setFollowing((f) => !f)}>
              {following ? 'Following presenter' : 'Unfollow'}
            </button>
          ) : null}
          {isPresenter ? (
            <>
              <button type="button" className="miro-chip" onClick={() => toggleFollowMode(!board.followPresenter)}>
                {board.followPresenter ? 'Stop follow-mode' : 'Force follow me'}
              </button>
              <button type="button" className="miro-chip" onClick={() => toggleShare(!board.hasShareLink)}>
                {shareCopied ? 'Link copied' : board.hasShareLink ? 'Disable share link' : 'Copy share link'}
              </button>
              <button
                type="button"
                className="miro-chip danger"
                onClick={async () => {
                  if (!confirm('End whiteboard for everyone?')) return;
                  const res = await whiteboardApi.endBoard(code, participantId);
                  applyBoard(res.whiteboard);
                }}
              >
                End
              </button>
            </>
          ) : null}
          <button type="button" className="miro-chip" onClick={exportSvg}>
            Export SVG
          </button>
          <button type="button" className="miro-chip" onClick={() => exportPdf()}>
            Export PDF
          </button>
          {canWrite ? (
            <button type="button" className="miro-chip" onClick={() => fileRef.current?.click()}>
              Import SVG
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
          <span className="miro-zoom">{Math.round(v.zoom * 100)}%</span>
        </div>
      </header>

      <aside className="miro-rail" aria-label="Tools">
        {(
          [
            ['select', 'Select'],
            ['hand', 'Hand'],
            ['sticky', 'Sticky'],
            ['frame', 'Frame'],
            ['rect', 'Rect'],
            ['ellipse', 'Ellipse'],
            ['arrow', 'Arrow'],
            ['line', 'Line'],
            ['pen', 'Pen'],
            ['text', 'Text'],
            ['eraser', 'Eraser'],
          ] as [Tool, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`miro-tool${tool === t ? ' active' : ''}`}
            title={label}
            disabled={!canWrite && t !== 'select' && t !== 'hand'}
            onClick={() => setTool(t)}
          >
            <span aria-hidden>{toolEmoji(t)}</span>
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <aside className="miro-people" aria-label="Participants">
        <div className="miro-people-title">People</div>
        {board.participants.map((p) => (
          <div key={p.id} className="miro-person">
            <span>
              {p.name}
              {p.isFacilitator ? ' · presenter' : ''}
              {p.id === participantId ? ' (you)' : ''}
            </span>
            {isPresenter && !p.isFacilitator ? (
              <button
                type="button"
                className="miro-mini"
                onClick={() => toggleWriter(p.id, !p.canWrite)}
                title={p.canWrite ? 'Revoke write' : 'Grant write'}
              >
                {p.canWrite ? '✎ on' : '✎ off'}
              </button>
            ) : (
              <em>{p.canWrite ? 'edit' : 'view'}</em>
            )}
          </div>
        ))}
        {board.presence
          .filter((p) => p.editingId)
          .map((p) => (
            <div key={`edit-${p.id}`} className="miro-editing">
              {p.name} is editing…
            </div>
          ))}
      </aside>

      <div className="miro-palette">
        <div className="miro-swatches">
          {(tool === 'sticky' ? STICKY_COLORS : COLORS).map((c) => (
            <button
              key={c}
              type="button"
              className={`miro-swatch${(tool === 'sticky' ? stickyColor : color) === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => (tool === 'sticky' ? setStickyColor(c) : setColor(c))}
            />
          ))}
        </div>
        {tool !== 'sticky' && tool !== 'hand' && tool !== 'select' ? (
          <div className="miro-sizes">
            {SIZES.map((s) => (
              <button key={s} type="button" className={`miro-size${size === s ? ' active' : ''}`} onClick={() => setSize(s)}>
                <i style={{ width: s + 4, height: s + 4 }} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="miro-stage"
        style={{ cursor }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="miro-world" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` }}>
          <div className="miro-grid" aria-hidden />
          <svg className="miro-svg" width="8000" height="8000" viewBox="-4000 -4000 8000 8000">
            {elements.map((item) => renderSvgItem(item, selectedId))}
          </svg>

          {elements.map((item) => {
            if (item.type !== 'sticky' && item.type !== 'text') return null;
            return (
              <div
                key={item.id}
                className={`${item.type === 'sticky' ? 'miro-sticky' : 'miro-text'}${selectedId === item.id ? ' selected' : ''}`}
                style={
                  item.type === 'sticky'
                    ? {
                        left: item.x,
                        top: item.y,
                        width: item.w,
                        height: item.h,
                        background: item.color,
                      }
                    : {
                        left: item.x,
                        top: item.y,
                        color: item.color,
                        fontSize: item.size,
                      }
                }
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!canWrite) return;
                  setEditingId(item.id);
                  setEditText(item.text || '');
                  queuePresence({ x: item.x || 0, y: item.y || 0 }, item.id);
                }}
              >
                {editingId === item.id ? (
                  <textarea
                    className="miro-edit"
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={async () => {
                      await patchElement(item.id, { text: editText.trim() || (item.type === 'sticky' ? 'Sticky note' : 'Text') });
                      setEditingId(null);
                      queuePresence({ x: item.x || 0, y: item.y || 0 }, null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p>{item.text || (item.type === 'sticky' ? 'Double-click to edit' : 'Text')}</p>
                )}
              </div>
            );
          })}

          {board.presence
            .filter((p) => p.id !== participantId)
            .map((p) => (
              <div key={`cur-${p.id}`} className="miro-cursor" style={{ left: p.x, top: p.y }}>
                <i style={{ background: p.isFacilitator ? '#2563eb' : '#7c3aed' }} />
                <span>{p.name}</span>
              </div>
            ))}
        </div>

        {error ? <div className="miro-banner">{error}</div> : null}
        <div className="miro-hint">
          Presenter grants write access · Room mates only unless share link · Scroll zoom · Space pan
        </div>
      </div>
    </div>
  );
}

function hitTest(el: WhiteboardElement, wx: number, wy: number) {
  if (el.type === 'sticky' || el.type === 'rect' || el.type === 'ellipse' || el.type === 'frame' || el.type === 'text') {
    const w = el.type === 'text' ? Math.max(80, (el.text?.length || 1) * (el.size || 16) * 0.6) : el.w || 0;
    const h = el.type === 'text' ? (el.size || 16) * 1.4 : el.h || 0;
    return wx >= (el.x || 0) && wx <= (el.x || 0) + w && wy >= (el.y || 0) && wy <= (el.y || 0) + h;
  }
  if (el.type === 'arrow' || el.type === 'line') {
    const minX = Math.min(el.x || 0, (el.x || 0) + (el.w || 0)) - 8;
    const maxX = Math.max(el.x || 0, (el.x || 0) + (el.w || 0)) + 8;
    const minY = Math.min(el.y || 0, (el.y || 0) + (el.h || 0)) - 8;
    const maxY = Math.max(el.y || 0, (el.y || 0) + (el.h || 0)) + 8;
    return wx >= minX && wx <= maxX && wy >= minY && wy <= maxY;
  }
  return false;
}

function renderSvgItem(item: WhiteboardElement | Partial<WhiteboardElement>, selectedId: string | null) {
  const id = item.id || 'draft';
  if (item.type === 'pen' || item.type === 'eraser') {
    const pts = item.points || [];
    if (pts.length < 2) return null;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
    return (
      <path
        key={id}
        d={d}
        fill="none"
        stroke={item.type === 'eraser' ? '#f7f8fa' : item.color}
        strokeWidth={item.type === 'eraser' ? (item.size || 4) * 4 : item.size || 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (item.type === 'rect' || item.type === 'frame') {
    return (
      <rect
        key={id}
        x={item.x}
        y={item.y}
        width={Math.max(item.w || 0, 1)}
        height={Math.max(item.h || 0, 1)}
        fill={item.type === 'frame' ? 'rgba(59,130,246,0.06)' : 'none'}
        stroke={item.color}
        strokeWidth={item.size || 2}
        className={selectedId === id ? 'miro-selected' : undefined}
      />
    );
  }
  if (item.type === 'ellipse') {
    return (
      <ellipse
        key={id}
        cx={(item.x || 0) + (item.w || 0) / 2}
        cy={(item.y || 0) + (item.h || 0) / 2}
        rx={Math.max((item.w || 0) / 2, 1)}
        ry={Math.max((item.h || 0) / 2, 1)}
        fill="none"
        stroke={item.color}
        strokeWidth={item.size || 2}
        className={selectedId === id ? 'miro-selected' : undefined}
      />
    );
  }
  if (item.type === 'arrow' || item.type === 'line') {
    const x2 = (item.x || 0) + (item.w || 0);
    const y2 = (item.y || 0) + (item.h || 0);
    const angle = Math.atan2(item.h || 0, item.w || 0);
    const head = Math.max(12, (item.size || 2) * 4);
    return (
      <g key={id} className={selectedId === id ? 'miro-selected' : undefined}>
        <line x1={item.x} y1={item.y} x2={x2} y2={y2} stroke={item.color} strokeWidth={item.size || 2} strokeLinecap="round" />
        {item.type === 'arrow' ? (
          <polygon
            points={`${x2},${y2} ${x2 - head * Math.cos(angle - Math.PI / 6)},${y2 - head * Math.sin(angle - Math.PI / 6)} ${x2 - head * Math.cos(angle + Math.PI / 6)},${y2 - head * Math.sin(angle + Math.PI / 6)}`}
            fill={item.color}
          />
        ) : null}
      </g>
    );
  }
  return null;
}

function toolEmoji(t: Tool) {
  const map: Record<Tool, string> = {
    select: '🖱️',
    hand: '✋',
    sticky: '🗒️',
    frame: '▢',
    rect: '▭',
    ellipse: '◯',
    arrow: '➜',
    line: '/',
    pen: '✏️',
    text: '🔤',
    eraser: '🧹',
  };
  return map[t];
}
