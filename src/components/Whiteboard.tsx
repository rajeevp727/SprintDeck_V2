import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Tool = 'select' | 'hand' | 'sticky' | 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'eraser';

type Point = { x: number; y: number };

type BoardItem =
  | {
      id: string;
      type: 'pen' | 'eraser';
      color: string;
      size: number;
      points: Point[];
    }
  | {
      id: string;
      type: 'rect' | 'ellipse' | 'arrow';
      color: string;
      size: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      type: 'text';
      color: string;
      size: number;
      x: number;
      y: number;
      text: string;
    }
  | {
      id: string;
      type: 'sticky';
      color: string;
      x: number;
      y: number;
      text: string;
      w: number;
      h: number;
    };

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

const STORAGE_KEY = 'sprintdeck.whiteboard.v1';
const COLORS = ['#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const STICKY_COLORS = ['#fef08a', '#fdba74', '#86efac', '#93c5fd', '#d8b4fe', '#fda4af'];
const SIZES = [2, 4, 8, 14];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadStore(): { items: BoardItem[]; viewport: Viewport } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  } catch {
    return { items: [], viewport: { x: 0, y: 0, zoom: 1 } };
  }
}

function hitTest(item: BoardItem, wx: number, wy: number): boolean {
  if (item.type === 'sticky' || item.type === 'rect' || item.type === 'ellipse' || item.type === 'text') {
    const w = item.type === 'text' ? Math.max(80, (item.text?.length || 1) * item.size * 2.2) : item.w;
    const h = item.type === 'text' ? item.size * 5 : item.h;
    return wx >= item.x && wx <= item.x + w && wy >= item.y && wy <= item.y + h;
  }
  if (item.type === 'arrow') {
    const minX = Math.min(item.x, item.x + item.w) - 8;
    const maxX = Math.max(item.x, item.x + item.w) + 8;
    const minY = Math.min(item.y, item.y + item.h) - 8;
    const maxY = Math.max(item.y, item.y + item.h) + 8;
    return wx >= minX && wx <= maxX && wy >= minY && wy <= maxY;
  }
  if ((item.type === 'pen' || item.type === 'eraser') && item.points.length) {
    const pad = Math.max(10, item.size * 2);
    for (const p of item.points) {
      if (Math.hypot(p.x - wx, p.y - wy) <= pad) return true;
    }
  }
  return false;
}

/** Miro-style infinite whiteboard — pan/zoom canvas with stickies, shapes, pen & text. */
export default function Whiteboard({ onBack }: { onBack: () => void }) {
  const initial = useMemo(() => loadStore(), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#111827');
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  const [size, setSize] = useState(4);
  const [items, setItems] = useState<BoardItem[]>(initial.items);
  const [viewport, setViewport] = useState<Viewport>(initial.viewport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const historyRef = useRef<BoardItem[][]>([initial.items]);
  const histIdx = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const dragRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { mode: 'move'; id: string; ox: number; oy: number; start: BoardItem }
    | { mode: 'draw'; start: Point }
    | null
  >(null);

  const effectiveTool: Tool = spaceDown ? 'hand' : tool;

  const pushHistory = useCallback((next: BoardItem[]) => {
    const truncated = historyRef.current.slice(0, histIdx.current + 1);
    truncated.push(next);
    if (truncated.length > 80) truncated.shift();
    historyRef.current = truncated;
    histIdx.current = truncated.length - 1;
    setItems(next);
  }, []);

  const undo = useCallback(() => {
    if (histIdx.current <= 0) return;
    histIdx.current -= 1;
    setItems(historyRef.current[histIdx.current]);
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    if (histIdx.current >= historyRef.current.length - 1) return;
    histIdx.current += 1;
    setItems(historyRef.current[histIdx.current]);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, viewport }));
  }, [items, viewport]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceDown(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushHistory(itemsRef.current.filter((i) => i.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('hand');
      if (e.key === 'n' || e.key === 'N') setTool('sticky');
      if (e.key === 'p' || e.key === 'P') setTool('pen');
      if (e.key === 't' || e.key === 'T') setTool('text');
      if (e.key === 'r' || e.key === 'R') setTool('rect');
      if (e.key === 'o' || e.key === 'O') setTool('ellipse');
      if (e.key === 'a' || e.key === 'A') setTool('arrow');
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
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
  }, [items, selectedId, pushHistory, undo, redo]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const wx = (mx - v.x) / v.zoom;
      const wy = (my - v.y) / v.zoom;
      return { zoom, x: mx - wx * zoom, y: my - wy * zoom };
    });
  };

  const beginEdit = (item: BoardItem) => {
    if (item.type !== 'sticky' && item.type !== 'text') return;
    setEditingId(item.id);
    setEditText(item.text);
    setSelectedId(item.id);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editText.trim();
    pushHistory(
      itemsRef.current
        .map((i) => {
          if (i.id !== editingId) return i;
          if (i.type === 'sticky' || i.type === 'text') return { ...i, text: text || (i.type === 'sticky' ? 'Sticky note' : 'Text') };
          return i;
        })
        .filter((i) => !(i.type === 'text' && !text)),
    );
    setEditingId(null);
    setEditText('');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || effectiveTool === 'hand') {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    if (effectiveTool === 'select') {
      const hit = [...items].reverse().find((i) => hitTest(i, world.x, world.y));
      setSelectedId(hit?.id ?? null);
      if (hit && hit.type !== 'pen' && hit.type !== 'eraser') {
        dragRef.current = { mode: 'move', id: hit.id, ox: world.x - ('x' in hit ? hit.x : 0), oy: world.y - ('y' in hit ? hit.y : 0), start: hit };
      }
      return;
    }

    if (effectiveTool === 'sticky') {
      const sticky: BoardItem = {
        id: uid(),
        type: 'sticky',
        color: stickyColor,
        x: world.x - 70,
        y: world.y - 70,
        w: 160,
        h: 160,
        text: '',
      };
      pushHistory([...items, sticky]);
      setSelectedId(sticky.id);
      setEditingId(sticky.id);
      setEditText('');
      setTool('select');
      return;
    }

    if (effectiveTool === 'text') {
      const textItem: BoardItem = {
        id: uid(),
        type: 'text',
        color,
        size: Math.max(16, size * 4),
        x: world.x,
        y: world.y,
        text: '',
      };
      pushHistory([...items, textItem]);
      setSelectedId(textItem.id);
      setEditingId(textItem.id);
      setEditText('');
      setTool('select');
      return;
    }

    if (effectiveTool === 'pen' || effectiveTool === 'eraser') {
      setDraft({ id: uid(), type: effectiveTool, color, size, points: [world] });
      dragRef.current = { mode: 'draw', start: world };
      return;
    }

    if (effectiveTool === 'rect' || effectiveTool === 'ellipse' || effectiveTool === 'arrow') {
      setDraft({
        id: uid(),
        type: effectiveTool,
        color,
        size,
        x: world.x,
        y: world.y,
        w: 0,
        h: 0,
      });
      dragRef.current = { mode: 'draw', start: world };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === 'pan') {
      setViewport((v) => ({
        ...v,
        x: drag.vx + (e.clientX - drag.sx),
        y: drag.vy + (e.clientY - drag.sy),
      }));
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    if (drag.mode === 'move') {
      setItems((list) =>
        list.map((i) => {
          if (i.id !== drag.id) return i;
          if (i.type === 'pen' || i.type === 'eraser') return i;
          return { ...i, x: world.x - drag.ox, y: world.y - drag.oy };
        }),
      );
      return;
    }

    if (drag.mode === 'draw' && draft) {
      if (draft.type === 'pen' || draft.type === 'eraser') {
        setDraft({ ...draft, points: [...draft.points, world] });
      } else if (draft.type === 'rect' || draft.type === 'ellipse') {
        setDraft({
          ...draft,
          x: Math.min(drag.start.x, world.x),
          y: Math.min(drag.start.y, world.y),
          w: Math.abs(world.x - drag.start.x),
          h: Math.abs(world.y - drag.start.y),
        });
      } else if (draft.type === 'arrow') {
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

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag?.mode === 'move') {
      pushHistory(itemsRef.current);
    }
    if (drag?.mode === 'draw' && draft) {
      const tooSmall =
        (draft.type === 'rect' || draft.type === 'ellipse') && draft.w < 4 && draft.h < 4;
      const emptyPen = (draft.type === 'pen' || draft.type === 'eraser') && draft.points.length < 2;
      if (!tooSmall && !emptyPen) pushHistory([...itemsRef.current, draft]);
      setDraft(null);
    }
    dragRef.current = null;
  };

  const clearAll = () => {
    if (!confirm('Clear the entire whiteboard?')) return;
    pushHistory([]);
    setSelectedId(null);
    setDraft(null);
  };

  const exportPng = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    const paint = (item: BoardItem) => {
      ctx.save();
      if (item.type === 'pen' || item.type === 'eraser') {
        if (item.points.length < 2) return;
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = item.size;
        ctx.strokeStyle = item.color;
        if (item.type === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = item.size * 4;
        }
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) ctx.lineTo(item.points[i].x, item.points[i].y);
        ctx.stroke();
      } else if (item.type === 'rect') {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.size;
        ctx.strokeRect(item.x, item.y, item.w, item.h);
      } else if (item.type === 'ellipse') {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.size;
        ctx.beginPath();
        ctx.ellipse(item.x + item.w / 2, item.y + item.h / 2, Math.max(item.w / 2, 1), Math.max(item.h / 2, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.type === 'arrow') {
        const x2 = item.x + item.w;
        const y2 = item.y + item.h;
        const angle = Math.atan2(item.h, item.w);
        const head = Math.max(12, item.size * 4);
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = item.size;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'text') {
        ctx.fillStyle = item.color;
        ctx.font = `600 ${item.size}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(item.text || 'Text', item.x, item.y + item.size);
      } else if (item.type === 'sticky') {
        ctx.fillStyle = item.color;
        ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.fillStyle = '#1f2937';
        ctx.font = '500 14px "Segoe UI", system-ui, sans-serif';
        const lines = (item.text || 'Sticky note').split('\n');
        lines.forEach((line, idx) => ctx.fillText(line, item.x + 12, item.y + 28 + idx * 18));
      }
      ctx.restore();
    };

    for (const item of items) paint(item);
    const a = document.createElement('a');
    a.download = `sprintdeck-whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const renderables = draft ? [...items, draft] : items;
  const cursor =
    effectiveTool === 'hand'
      ? 'grab'
      : effectiveTool === 'select'
        ? 'default'
        : effectiveTool === 'pen' || effectiveTool === 'eraser'
          ? 'crosshair'
          : 'crosshair';

  return (
    <div className="miro">
      <header className="miro-top">
        <div className="miro-top-left">
          <button type="button" className="miro-back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="miro-brand">
            <strong>Whiteboard</strong>
            <span>Infinite canvas · autosaved</span>
          </div>
        </div>
        <div className="miro-top-actions">
          <button type="button" className="miro-chip" onClick={undo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="miro-chip" onClick={redo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <button type="button" className="miro-chip" onClick={exportPng}>
            Export PNG
          </button>
          <button type="button" className="miro-chip danger" onClick={clearAll}>
            Clear
          </button>
          <span className="miro-zoom">{Math.round(viewport.zoom * 100)}%</span>
        </div>
      </header>

      <aside className="miro-rail" aria-label="Tools">
        {(
          [
            ['select', 'V', 'Select'],
            ['hand', 'H', 'Hand'],
            ['sticky', 'N', 'Sticky'],
            ['rect', 'R', 'Rectangle'],
            ['ellipse', 'O', 'Ellipse'],
            ['arrow', 'A', 'Arrow'],
            ['pen', 'P', 'Pen'],
            ['text', 'T', 'Text'],
            ['eraser', 'E', 'Eraser'],
          ] as [Tool, string, string][]
        ).map(([t, key, label]) => (
          <button
            key={t}
            type="button"
            className={`miro-tool${tool === t ? ' active' : ''}`}
            title={`${label} (${key})`}
            onClick={() => setTool(t)}
          >
            <ToolIcon tool={t} />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <div className="miro-palette">
        <div className="miro-swatches">
          {(tool === 'sticky' ? STICKY_COLORS : COLORS).map((c) => (
            <button
              key={c}
              type="button"
              className={`miro-swatch${(tool === 'sticky' ? stickyColor : color) === c ? ' active' : ''}`}
              style={{ background: c, outlineColor: c === '#ffffff' ? '#cbd5e1' : c }}
              onClick={() => (tool === 'sticky' ? setStickyColor(c) : setColor(c))}
              title="Color"
            />
          ))}
        </div>
        {tool !== 'sticky' && tool !== 'hand' && tool !== 'select' && (
          <div className="miro-sizes">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`miro-size${size === s ? ' active' : ''}`}
                onClick={() => setSize(s)}
                title={`Stroke ${s}`}
              >
                <i style={{ width: s + 4, height: s + 4 }} />
              </button>
            ))}
          </div>
        )}
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
        <div
          className="miro-world"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          <div className="miro-grid" aria-hidden />
          <svg className="miro-svg" width="8000" height="8000" viewBox="-4000 -4000 8000 8000">
            {renderables.map((item) => {
              if (item.type === 'pen' || item.type === 'eraser') {
                if (item.points.length < 2) return null;
                const d = item.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
                return (
                  <path
                    key={item.id}
                    d={d}
                    fill="none"
                    stroke={item.type === 'eraser' ? '#f7f8fa' : item.color}
                    strokeWidth={item.type === 'eraser' ? item.size * 4 : item.size}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={item.type === 'eraser' ? 1 : 1}
                  />
                );
              }
              if (item.type === 'rect') {
                return (
                  <rect
                    key={item.id}
                    x={item.x}
                    y={item.y}
                    width={Math.max(item.w, 1)}
                    height={Math.max(item.h, 1)}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={item.size}
                    className={selectedId === item.id ? 'miro-selected' : undefined}
                  />
                );
              }
              if (item.type === 'ellipse') {
                return (
                  <ellipse
                    key={item.id}
                    cx={item.x + item.w / 2}
                    cy={item.y + item.h / 2}
                    rx={Math.max(item.w / 2, 1)}
                    ry={Math.max(item.h / 2, 1)}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={item.size}
                    className={selectedId === item.id ? 'miro-selected' : undefined}
                  />
                );
              }
              if (item.type === 'arrow') {
                const x2 = item.x + item.w;
                const y2 = item.y + item.h;
                const angle = Math.atan2(item.h, item.w);
                const head = Math.max(12, item.size * 4);
                const p1x = x2 - head * Math.cos(angle - Math.PI / 6);
                const p1y = y2 - head * Math.sin(angle - Math.PI / 6);
                const p2x = x2 - head * Math.cos(angle + Math.PI / 6);
                const p2y = y2 - head * Math.sin(angle + Math.PI / 6);
                return (
                  <g key={item.id} className={selectedId === item.id ? 'miro-selected' : undefined}>
                    <line x1={item.x} y1={item.y} x2={x2} y2={y2} stroke={item.color} strokeWidth={item.size} strokeLinecap="round" />
                    <polygon points={`${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={item.color} />
                  </g>
                );
              }
              return null;
            })}
          </svg>

          {renderables.map((item) => {
            if (item.type === 'sticky') {
              return (
                <div
                  key={item.id}
                  className={`miro-sticky${selectedId === item.id ? ' selected' : ''}`}
                  style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: item.color }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginEdit(item);
                  }}
                  onPointerDown={(e) => {
                    if (effectiveTool !== 'select') return;
                    e.stopPropagation();
                    setSelectedId(item.id);
                    const world = screenToWorld(e.clientX, e.clientY);
                    dragRef.current = {
                      mode: 'move',
                      id: item.id,
                      ox: world.x - item.x,
                      oy: world.y - item.y,
                      start: item,
                    };
                  }}
                >
                  {editingId === item.id ? (
                    <textarea
                      className="miro-edit"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          commitEdit();
                        }
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      placeholder="Type a note…"
                    />
                  ) : (
                    <p>{item.text || 'Double-click to edit'}</p>
                  )}
                </div>
              );
            }
            if (item.type === 'text') {
              return (
                <div
                  key={item.id}
                  className={`miro-text${selectedId === item.id ? ' selected' : ''}`}
                  style={{ left: item.x, top: item.y, color: item.color, fontSize: item.size }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    beginEdit(item);
                  }}
                  onPointerDown={(e) => {
                    if (effectiveTool !== 'select') return;
                    e.stopPropagation();
                    setSelectedId(item.id);
                    const world = screenToWorld(e.clientX, e.clientY);
                    dragRef.current = {
                      mode: 'move',
                      id: item.id,
                      ox: world.x - item.x,
                      oy: world.y - item.y,
                      start: item,
                    };
                  }}
                >
                  {editingId === item.id ? (
                    <input
                      className="miro-edit-inline"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    item.text || 'Text'
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className="miro-hint">
          Scroll to zoom · Space/middle-drag to pan · Del to delete · Autosaved locally
        </div>
      </div>
    </div>
  );
}

function ToolIcon({ tool }: { tool: Tool }) {
  switch (tool) {
    case 'select':
      return <span aria-hidden>🖱️</span>;
    case 'hand':
      return <span aria-hidden>✋</span>;
    case 'sticky':
      return <span aria-hidden>🗒️</span>;
    case 'rect':
      return <span aria-hidden>▭</span>;
    case 'ellipse':
      return <span aria-hidden>◯</span>;
    case 'arrow':
      return <span aria-hidden>➜</span>;
    case 'pen':
      return <span aria-hidden>✏️</span>;
    case 'text':
      return <span aria-hidden>🔤</span>;
    case 'eraser':
      return <span aria-hidden>🧹</span>;
  }
}
