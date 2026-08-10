import type { WhiteboardElement, WhiteboardViewport } from './whiteboardTypes';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build a standalone SVG document from whiteboard elements. */
export function elementsToSvg(elements: WhiteboardElement[], viewport?: WhiteboardViewport): string {
  const parts: string[] = [];
  for (const el of elements) {
    if (el.type === 'pen' || el.type === 'eraser') {
      const pts = el.points || [];
      if (pts.length < 2) continue;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
      parts.push(
        `<path d="${d}" fill="none" stroke="${esc(el.color)}" stroke-width="${el.size || 4}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else if (el.type === 'rect' || el.type === 'frame') {
      parts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.type === 'frame' ? 'rgba(59,130,246,0.06)' : 'none'}" stroke="${esc(el.color)}" stroke-width="${el.size || 2}"/>`,
      );
    } else if (el.type === 'ellipse') {
      parts.push(
        `<ellipse cx="${(el.x || 0) + (el.w || 0) / 2}" cy="${(el.y || 0) + (el.h || 0) / 2}" rx="${Math.max((el.w || 0) / 2, 1)}" ry="${Math.max((el.h || 0) / 2, 1)}" fill="none" stroke="${esc(el.color)}" stroke-width="${el.size || 2}"/>`,
      );
    } else if (el.type === 'arrow' || el.type === 'line') {
      const x2 = (el.x || 0) + (el.w || 0);
      const y2 = (el.y || 0) + (el.h || 0);
      parts.push(
        `<line x1="${el.x}" y1="${el.y}" x2="${x2}" y2="${y2}" stroke="${esc(el.color)}" stroke-width="${el.size || 2}" stroke-linecap="round"/>`,
      );
      if (el.type === 'arrow') {
        const angle = Math.atan2(el.h || 0, el.w || 0);
        const head = Math.max(12, (el.size || 2) * 4);
        const p1x = x2 - head * Math.cos(angle - Math.PI / 6);
        const p1y = y2 - head * Math.sin(angle - Math.PI / 6);
        const p2x = x2 - head * Math.cos(angle + Math.PI / 6);
        const p2y = y2 - head * Math.sin(angle + Math.PI / 6);
        parts.push(`<polygon points="${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}" fill="${esc(el.color)}"/>`);
      }
    } else if (el.type === 'text') {
      parts.push(
        `<text x="${el.x}" y="${(el.y || 0) + (el.size || 16)}" fill="${esc(el.color)}" font-size="${el.size || 16}" font-family="Segoe UI, system-ui, sans-serif" font-weight="600">${esc(el.text || '')}</text>`,
      );
    } else if (el.type === 'sticky') {
      parts.push(
        `<g><rect x="${el.x}" y="${el.y}" width="${el.w || 160}" height="${el.h || 160}" fill="${esc(el.color)}" stroke="#00000022"/><foreignObject x="${(el.x || 0) + 10}" y="${(el.y || 0) + 10}" width="${(el.w || 160) - 20}" height="${(el.h || 160) - 20}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:500 14px Segoe UI,system-ui,sans-serif;color:#1f2937;white-space:pre-wrap">${esc(el.text || '')}</div></foreignObject></g>`,
      );
    }
  }

  const vx = viewport?.x ?? 0;
  const vy = viewport?.y ?? 0;
  const zoom = viewport?.zoom ?? 1;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="${-vx / zoom} ${-vy / zoom} ${1600 / zoom} ${900 / zoom}">\n<rect width="100%" height="100%" fill="#f7f8fa"/>\n${parts.join('\n')}\n</svg>`;
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBoardPdf(elements: WhiteboardElement[], viewport: WhiteboardViewport, filename: string) {
  const svg = elementsToSvg(elements, viewport);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  const jpegBytes = dataUrlToBytes(jpeg);
  const pdf = jpegToPdf(jpegBytes, canvas.width, canvas.height);
  const copy = new Uint8Array(pdf.byteLength);
  copy.set(pdf);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(',')[1] || '');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const push = (s: string | Uint8Array) => chunks.push(typeof s === 'string' ? enc.encode(s) : s);
  const content = enc.encode(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);

  const imgBody = concat(
    enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
    jpeg,
    enc.encode('\nendstream'),
  );
  const contentBody = concat(enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode('\nendstream'));
  const pageBody = enc.encode(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  const pagesBody = enc.encode(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  const catalogBody = enc.encode(`<< /Type /Catalog /Pages 2 0 R >>`);
  const objs = [catalogBody, pagesBody, pageBody, contentBody, imgBody];

  push('%PDF-1.4\n');
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(byteLength(chunks));
    push(`${i + 1} 0 obj\n`);
    push(objs[i]);
    push('\nendobj\n');
  }
  const xrefStart = byteLength(chunks);
  push(`xref\n0 ${objs.length + 1}\n`);
  push('0000000000 65535 f \n');
  for (let i = 1; i <= objs.length; i++) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return concat(...chunks);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function byteLength(chunks: Uint8Array[]) {
  return chunks.reduce((n, c) => n + c.length, 0);
}

/** Parse a simple SVG exported by this app (or basic shapes) into elements. */
export function importSvgToElements(svgText: string): Partial<WhiteboardElement>[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const out: Partial<WhiteboardElement>[] = [];
  const now = Date.now();

  doc.querySelectorAll('path').forEach((node) => {
    const d = node.getAttribute('d') || '';
    const points: { x: number; y: number }[] = [];
    const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(d))) points.push({ x: +m[1], y: +m[2] });
    if (points.length >= 2) {
      out.push({
        type: 'pen',
        color: node.getAttribute('stroke') || '#111827',
        size: Number(node.getAttribute('stroke-width') || 4),
        points,
        createdAt: now,
      });
    }
  });

  doc.querySelectorAll('rect').forEach((node) => {
    if (node.getAttribute('width') === '100%') return;
    out.push({
      type: 'rect',
      color: node.getAttribute('stroke') || '#111827',
      size: Number(node.getAttribute('stroke-width') || 2),
      x: Number(node.getAttribute('x') || 0),
      y: Number(node.getAttribute('y') || 0),
      w: Number(node.getAttribute('width') || 0),
      h: Number(node.getAttribute('height') || 0),
      createdAt: now,
    });
  });

  doc.querySelectorAll('ellipse').forEach((node) => {
    const cx = Number(node.getAttribute('cx') || 0);
    const cy = Number(node.getAttribute('cy') || 0);
    const rx = Number(node.getAttribute('rx') || 0);
    const ry = Number(node.getAttribute('ry') || 0);
    out.push({
      type: 'ellipse',
      color: node.getAttribute('stroke') || '#111827',
      size: Number(node.getAttribute('stroke-width') || 2),
      x: cx - rx,
      y: cy - ry,
      w: rx * 2,
      h: ry * 2,
      createdAt: now,
    });
  });

  doc.querySelectorAll('line').forEach((node) => {
    const x1 = Number(node.getAttribute('x1') || 0);
    const y1 = Number(node.getAttribute('y1') || 0);
    const x2 = Number(node.getAttribute('x2') || 0);
    const y2 = Number(node.getAttribute('y2') || 0);
    out.push({
      type: 'line',
      color: node.getAttribute('stroke') || '#111827',
      size: Number(node.getAttribute('stroke-width') || 2),
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      createdAt: now,
    });
  });

  doc.querySelectorAll('text').forEach((node) => {
    out.push({
      type: 'text',
      color: node.getAttribute('fill') || '#111827',
      size: Number(node.getAttribute('font-size') || 16),
      x: Number(node.getAttribute('x') || 0),
      y: Number(node.getAttribute('y') || 0) - Number(node.getAttribute('font-size') || 16),
      text: node.textContent || '',
      createdAt: now,
    });
  });

  return out;
}
