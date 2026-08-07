import { useCallback, useEffect, useRef, useState } from 'react';

type Tool = 'pen' | 'eraser' | 'rect' | 'circle' | 'arrow' | 'text' | 'sticky';
type Color = string;

interface Point {
  x: number;
  y: number;
}

interface Shape {
  type: Tool;
  color: Color;
  size: number;
  points?: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  x?: number;
  y?: number;
}

const COLORS = [
  '#1a1a1a', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff',
];
const SIZES = [2, 4, 8, 14];
const STICKY_COLORS = ['#fef08a', '#fca5a5', '#86efac', '#93c5fd', '#d8b4fe', '#fed7aa'];

export default function Whiteboard({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<Color>('#1a1a1a');
  const [size, setSize] = useState<number>(4);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redoStack, setRedoStack] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState<Shape | null>(null);
  const [stickies, setStickies] = useState<{ id: string; text: string; x: number; y: number; color: string }[]>([]);
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [stickyDraft, setStickyDraft] = useState('');
  const [newStickyColor, setNewStickyColor] = useState(STICKY_COLORS[0]);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const pushShape = useCallback((shape: Shape) => {
    setShapes((s) => [...s, shape]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setShapes((s) => {
      if (s.length === 0) return s;
      const next = s.slice(0, -1);
      setRedoStack((r) => [...r, s[s.length - 1]]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    setShapes((s) => [...s, restored]);
    setRedoStack((r) => r.slice(0, -1));
  }, [redoStack]);

  const clearAll = useCallback(() => {
    setShapes((s) => {
      setRedoStack((prev) => [...prev, ...s]);
      return [];
    });
    setStickies([]);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const drawShapes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const all = [...shapes, ...(current ? [current] : [])];
    for (const s of all) {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.type === 'pen' || s.type === 'eraser') {
        if (!s.points || s.points.length < 2) {
          ctx.restore();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        if (s.type === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = s.size * 4;
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (s.type === 'rect' && s.start && s.end) {
        const x = Math.min(s.start.x, s.end.x);
        const y = Math.min(s.start.y, s.end.y);
        const w = Math.abs(s.end.x - s.start.x);
        const h = Math.abs(s.end.y - s.start.y);
        ctx.strokeRect(x, y, w, h);
      } else if (s.type === 'circle' && s.start && s.end) {
        const rx = Math.abs(s.end.x - s.start.x) / 2;
        const ry = Math.abs(s.end.y - s.start.y) / 2;
        const cx = (s.start.x + s.end.x) / 2;
        const cy = (s.start.y + s.end.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === 'arrow' && s.start && s.end) {
        const angle = Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x);
        const headLen = Math.max(12, s.size * 4);
        ctx.beginPath();
        ctx.moveTo(s.start.x, s.start.y);
        ctx.lineTo(s.end.x, s.end.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.end.x, s.end.y);
        ctx.lineTo(
          s.end.x - headLen * Math.cos(angle - Math.PI / 6),
          s.end.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          s.end.x - headLen * Math.cos(angle + Math.PI / 6),
          s.end.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      } else if (s.type === 'text' && s.text) {
        ctx.font = `${Math.max(14, s.size * 4)}px "Inter", "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(s.text, s.x ?? 0, s.y ?? 0);
      }
      ctx.restore();
    }
  }, [shapes, current]);

  useEffect(() => {
    drawShapes();
  }, [drawShapes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      drawShapes();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawShapes]);

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);

    if (tool === 'text') {
      const id = `st-${Date.now()}`;
      setStickies((s) => [...s, { id, text: '', x: pos.x, y: pos.y, color }]);
      setEditingSticky(id);
      setStickyDraft('');
      setTool('sticky');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    if (tool === 'sticky' && editingSticky) {
      setEditingSticky(null);
      setTool('pen');
      return;
    }

    setDrawing(true);
    if (tool === 'pen' || tool === 'eraser') {
      setCurrent({ type: tool, color, size, points: [pos] });
    } else if (tool === 'rect' || tool === 'circle' || tool === 'arrow') {
      setCurrent({ type: tool, color, size, start: pos, end: pos });
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrent((c) => {
      if (!c) return c;
      if (c.type === 'pen' || c.type === 'eraser') {
        return { ...c, points: [...(c.points ?? []), pos] };
      }
      return { ...c, end: pos };
    });
  };

  const handleUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (current) {
      pushShape(current);
      setCurrent(null);
    }
  };

  const startStickyDrag = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos(e);
    const st = stickies.find((s) => s.id === id);
    if (!st) return;
    dragRef.current = { id, ox: pos.x - st.x, oy: pos.y - st.y };
  };

  const onStickyDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    setStickies((s) =>
      s.map((st) =>
        st.id === dragRef.current!.id
          ? { ...st, x: pos.x - dragRef.current!.ox, y: pos.y - dragRef.current!.oy }
          : st
      )
    );
  };

  const endStickyDrag = () => {
    dragRef.current = null;
  };

  const deleteSticky = (id: string) => {
    setStickies((s) => s.filter((st) => st.id !== id));
    if (editingSticky === id) setEditingSticky(null);
  };

  const commitSticky = (id: string) => {
    if (!stickyDraft.trim()) {
      deleteSticky(id);
      return;
    }
    setStickies((s) => s.map((st) => (st.id === id ? { ...st, text: stickyDraft } : st)));
    setEditingSticky(null);
    setStickyDraft('');
    setTool('pen');
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="whiteboard">
      <header className="wb-header">
        <div className="wb-header-left">
          <button className="ghost" onClick={onBack} title="Back">← Back</button>
          <span className="wb-title">Whiteboard</span>
        </div>
        <div className="wb-header-actions">
          <button className="ghost" onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button className="ghost" onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <button className="ghost" onClick={exportPng} title="Export PNG">Export PNG</button>
          <button className="ghost danger" onClick={clearAll} title="Clear all">Clear</button>
        </div>
      </header>

      <div className="wb-toolbar">
        <div className="wb-tool-group">
          {(['pen', 'eraser', 'rect', 'circle', 'arrow', 'text', 'sticky'] as Tool[]).map((t) => (
            <button
              key={t}
              className={`wb-tool${tool === t ? ' active' : ''}`}
              onClick={() => setTool(t)}
              title={
                t === 'pen'
                  ? 'Pen'
                  : t === 'eraser'
                  ? 'Eraser'
                  : t === 'rect'
                  ? 'Rectangle'
                  : t === 'circle'
                  ? 'Circle'
                  : t === 'arrow'
                  ? 'Arrow'
                  : t === 'text'
                  ? 'Text'
                  : 'Sticky note'
              }
            >
              {t === 'pen' && '✏️'}
              {t === 'eraser' && '🧹'}
              {t === 'rect' && '▭'}
              {t === 'circle' && '◯'}
              {t === 'arrow' && '➜'}
              {t === 'text' && '🔤'}
              {t === 'sticky' && '🗒️'}
            </button>
          ))}
        </div>

        <div className="wb-tool-group">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`wb-color${color === c ? ' active' : ''}`}
              style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#dce3ef' : c }}
              onClick={() => setColor(c)}
              title="Color"
            />
          ))}
        </div>

        <div className="wb-tool-group">
          {SIZES.map((s) => (
            <button
              key={s}
              className={`wb-size${size === s ? ' active' : ''}`}
              onClick={() => setSize(s)}
              title={`Size ${s}`}
            >
              <span className="wb-size-dot" style={{ width: s + 6, height: s + 6 }} />
            </button>
          ))}
        </div>

        {tool === 'sticky' && (
          <div className="wb-tool-group">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                className={`wb-color${newStickyColor === c ? ' active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewStickyColor(c)}
                title="Sticky color"
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="wb-canvas-wrap"
        onMouseMove={onStickyDrag}
        onMouseUp={endStickyDrag}
        onMouseLeave={endStickyDrag}
        onTouchMove={onStickyDrag}
        onTouchEnd={endStickyDrag}
      >
        <canvas
          ref={canvasRef}
          className="wb-canvas"
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleUp}
          onTouchStart={handleDown}
          onTouchMove={handleMove}
          onTouchEnd={handleUp}
        />
        {stickies.map((st) => (
          <div
            key={st.id}
            className={`wb-sticky${editingSticky === st.id ? ' editing' : ''}`}
            style={{
              left: st.x,
              top: st.y,
              backgroundColor: st.color,
            }}
            onMouseDown={(e) => startStickyDrag(e, st.id)}
            onTouchStart={(e) => startStickyDrag(e, st.id)}
            onDoubleClick={() => {
              setEditingSticky(st.id);
              setStickyDraft(st.text);
              setTimeout(() => textInputRef.current?.focus(), 50);
            }}
          >
            <div className="wb-sticky-text">{st.text || 'Double-click to edit'}</div>
            <button className="wb-sticky-del" onClick={() => deleteSticky(st.id)} title="Delete">
              ✕
            </button>
            {editingSticky === st.id && (
              <input
                ref={textInputRef}
                className="wb-sticky-input"
                value={stickyDraft}
                onChange={(e) => setStickyDraft(e.target.value)}
                onBlur={() => commitSticky(st.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitSticky(st.id);
                  }
                  if (e.key === 'Escape') {
                    setEditingSticky(null);
                    setStickyDraft('');
                  }
                }}
                placeholder="Type…"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
