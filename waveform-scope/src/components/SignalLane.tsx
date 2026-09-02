import { useEffect, useMemo, useRef } from 'react';
import type { Brush, CursorPair, Viewport } from '../types';
import { useElementWidth } from '../hooks/useElementWidth';
import { formatDuration, formatValueUnit } from '../utils/format';
import { niceTimeTicks } from '../utils/axis';

export interface Trace {
  key: string;
  label: string;
  color: string;
  unit: string;
  data: number[];
}

interface DragState {
  mode: 'pan' | 'cursorA' | 'cursorB' | 'brush';
  lastX: number;
  brushStart?: number;
  moved?: boolean;
}

interface SignalLaneProps {
  /** One or more overlaid traces. */
  traces: Trace[];
  viewport: Viewport;
  cursors: CursorPair;
  brush: Brush | null;
  hoverIdx: number | null;
  /** True → all traces share one Y scale; false → each trace is auto-normalized. */
  sharedScale: boolean;
  fs: number;
  height?: number;
  onZoomAt: (factor: number, anchorFrac: number) => void;
  onPan: (deltaSamples: number) => void;
  onCursorMove: (which: 'a' | 'b', idx: number) => void;
  onBrush: (brush: Brush | null) => void;
  onHover: (idx: number | null) => void;
  onFit: () => void;
}

const PAD = { left: 10, right: 10, top: 12, bottom: 8 };
const CURSOR_COLORS = { a: '#fb923c', b: '#22d3ee' };
const CURSOR_HIT_PX = 8;

interface YRange {
  min: number;
  max: number;
}

/**
 * The oscilloscope lane: canvas-rendered traces with zoom/pan, draggable A/B
 * cursors and a box-selection (brush) region. All interactions are index-based
 * and delegated upwards so every lane stays perfectly synchronized.
 */
export function SignalLane(props: SignalLaneProps) {
  const { traces, viewport, cursors, brush, hoverIdx, sharedScale, fs, height = 150 } = props;
  const { onZoomAt, onPan, onCursorMove, onBrush, onHover, onFit } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();

  const dataLen = useMemo(() => traces.reduce((m, t) => Math.max(m, t.data.length), 1), [traces]);
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const span = Math.max(1, viewport.end - viewport.start);

  const xOf = (i: number) => PAD.left + ((i - viewport.start) / span) * plotW;

  // Per-trace Y ranges over the visible window (combined when sharedScale).
  const ranges = useMemo(() => {
    const i0 = Math.max(0, Math.floor(viewport.start));
    const per = traces.map((t) => {
      const i1 = Math.min(t.data.length, Math.ceil(viewport.end));
      let min = Infinity;
      let max = -Infinity;
      for (let i = i0; i < i1; i++) {
        const v = t.data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
        const base = Number.isFinite(min) ? min : 0;
        max = base + (Math.abs(base) || 1) * 0.1;
        min = base - (Math.abs(base) || 1) * 0.1;
      }
      return { min, max } as YRange;
    });
    const overall: YRange =
      sharedScale && per.length > 1
        ? {
            min: Math.min(...per.map((r) => r.min)),
            max: Math.max(...per.map((r) => r.max)),
          }
        : per[0] ?? { min: 0, max: 1 };
    return { per, overall };
  }, [traces, viewport, sharedScale]);

  // ---- rendering -----------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // background
    ctx.fillStyle = '#0a1017';
    ctx.fillRect(0, 0, width, height);

    // horizontal grid
    ctx.strokeStyle = 'rgba(148,163,184,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = 1; d < 4; d++) {
      const y = PAD.top + (plotH * d) / 4;
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
    }
    ctx.stroke();

    // vertical grid at nice time ticks (same algorithm as the time axis)
    if (fs > 0) {
      const ticks = niceTimeTicks(viewport.start / fs, viewport.end / fs, plotW);
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.beginPath();
      for (const tk of ticks) {
        const x = PAD.left + ((tk.t * fs - viewport.start) / span) * plotW;
        if (x < PAD.left || x > PAD.left + plotW) continue;
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + plotH);
      }
      ctx.stroke();
    }

    // active measurement window tint (brush takes precedence over A/B cursors)
    const active = brush
      ? { start: Math.min(brush.start, brush.end), end: Math.max(brush.start, brush.end) }
      : { start: Math.min(cursors.a, cursors.b), end: Math.max(cursors.a, cursors.b) };
    const ax0 = Math.max(PAD.left, xOf(active.start));
    const ax1 = Math.min(PAD.left + plotW, xOf(active.end));
    if (ax1 > ax0) {
      ctx.fillStyle = brush ? 'rgba(56,189,248,0.08)' : 'rgba(148,163,184,0.05)';
      ctx.fillRect(ax0, PAD.top, ax1 - ax0, plotH);
    }

    // traces
    const i0 = Math.max(0, Math.floor(viewport.start));
    for (let ti = 0; ti < traces.length; ti++) {
      const trace = traces[ti];
      const i1 = Math.min(trace.data.length, Math.ceil(viewport.end));
      if (i1 <= i0) continue;
      const range = sharedScale ? ranges.overall : ranges.per[ti];
      const yOf = (v: number) => PAD.top + (1 - (v - range.min) / (range.max - range.min)) * plotH;

      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 1.25;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const samplesPerPx = (i1 - i0) / plotW;
      if (samplesPerPx <= 2) {
        // sparse: direct polyline
        for (let i = i0; i < i1; i++) {
          const x = xOf(i);
          const y = yOf(trace.data[i]);
          if (i === i0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        // dense: min/max envelope per pixel column (no aliasing)
        let lastY: number | null = null;
        for (let px = 0; px < plotW; px++) {
          const c0 = i0 + Math.floor(px * samplesPerPx);
          const c1 = Math.min(i1, Math.max(c0 + 1, i0 + Math.floor((px + 1) * samplesPerPx)));
          let min = Infinity;
          let max = -Infinity;
          for (let i = c0; i < c1; i++) {
            const v = trace.data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (!Number.isFinite(min)) continue;
          const x = PAD.left + px;
          const yMin = yOf(min);
          const yMax = yOf(max);
          if (lastY === null) {
            ctx.moveTo(x, yMax);
            ctx.lineTo(x, yMin);
            lastY = yMin;
          } else if (Math.abs(lastY - yMin) <= Math.abs(lastY - yMax)) {
            ctx.lineTo(x, yMin);
            ctx.lineTo(x, yMax);
            lastY = yMax;
          } else {
            ctx.lineTo(x, yMax);
            ctx.lineTo(x, yMin);
            lastY = yMin;
          }
        }
      }
      ctx.stroke();
    }

    // hover crosshair
    if (hoverIdx != null && hoverIdx >= viewport.start && hoverIdx <= viewport.end) {
      const x = xOf(hoverIdx);
      ctx.strokeStyle = 'rgba(226,232,240,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
    }

    // A/B cursors
    const drawCursor = (idx: number, color: string, label: string) => {
      const x = xOf(idx);
      if (x < PAD.left - 30 || x > PAD.left + plotW + 30) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = `${label} ${fs > 0 ? formatDuration(idx / fs) : idx.toFixed(0)}`;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      const tw = ctx.measureText(text).width + 8;
      const bx = Math.min(Math.max(x - tw / 2, PAD.left), PAD.left + plotW - tw);
      ctx.fillStyle = color;
      ctx.fillRect(bx, 0, tw, 13);
      ctx.fillStyle = '#0a0e14';
      ctx.fillText(text, bx + 4, 10);
    };
    drawCursor(cursors.a, CURSOR_COLORS.a, 'A');
    drawCursor(cursors.b, CURSOR_COLORS.b, 'B');

    // brush outline
    if (brush) {
      const x0 = xOf(Math.min(brush.start, brush.end));
      const x1 = xOf(Math.max(brush.start, brush.end));
      ctx.strokeStyle = 'rgba(56,189,248,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(x0, x1), PAD.top + 0.5, Math.abs(x1 - x0), plotH - 1);
      ctx.setLineDash([]);
    }
  });

  // ---- interactions --------------------------------------------------------

  const clampIdx = (i: number) => Math.min(Math.max(0, Math.round(i)), dataLen - 1);

  const sampleAtX = (x: number) => viewport.start + ((x - PAD.left) / plotW) * span;

  const cursorX = (which: 'a' | 'b') => PAD.left + ((cursors[which] - viewport.start) / span) * plotW;

  const localX = (e: { clientX: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return e.clientX - (rect?.left ?? 0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const x = localX(e);
    if (e.shiftKey) {
      dragRef.current = { mode: 'pan', lastX: x };
    } else if (Math.abs(x - cursorX('a')) <= CURSOR_HIT_PX) {
      dragRef.current = { mode: 'cursorA', lastX: x };
    } else if (Math.abs(x - cursorX('b')) <= CURSOR_HIT_PX) {
      dragRef.current = { mode: 'cursorB', lastX: x };
    } else {
      const idx = clampIdx(sampleAtX(x));
      dragRef.current = { mode: 'brush', lastX: x, brushStart: idx, moved: false };
      onBrush({ start: idx, end: idx });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const x = localX(e);
    const drag = dragRef.current;
    if (!drag) {
      onHover(clampIdx(sampleAtX(x)));
      const near =
        Math.abs(x - cursorX('a')) <= CURSOR_HIT_PX || Math.abs(x - cursorX('b')) <= CURSOR_HIT_PX;
      e.currentTarget.style.cursor = near ? 'ew-resize' : 'crosshair';
      return;
    }
    switch (drag.mode) {
      case 'pan': {
        const dxSamples = -((x - drag.lastX) / plotW) * span;
        drag.lastX = x;
        onPan(dxSamples);
        break;
      }
      case 'cursorA':
        onCursorMove('a', sampleAtX(x));
        break;
      case 'cursorB':
        onCursorMove('b', sampleAtX(x));
        break;
      case 'brush': {
        if (Math.abs(x - drag.lastX) > 2) drag.moved = true;
        const idx = clampIdx(sampleAtX(x));
        const s = drag.brushStart ?? idx;
        onBrush({ start: Math.min(s, idx), end: Math.max(s, idx) });
        break;
      }
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // click without drag → clear the box selection
    if (drag?.mode === 'brush' && !drag.moved) onBrush(null);
  };

  // wheel zoom needs a non-passive native listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left - PAD.left) / plotW;
      onZoomAt(e.deltaY > 0 ? 1.25 : 0.8, Math.min(Math.max(frac, 0), 1));
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [plotW, onZoomAt]);

  // ---- header --------------------------------------------------------------

  const hoverReadout =
    hoverIdx != null
      ? traces
          .map((t) => formatValueUnit(t.data[hoverIdx] ?? Number.NaN, t.unit))
          .join('   ')
      : null;

  const rangeReadout = traces
    .map((t, i) => {
      const r = sharedScale ? ranges.overall : ranges.per[i];
      const prefix = !sharedScale || traces.length === 1 ? '' : `${t.label} `;
      return `${prefix}${formatValueUnit(r.min, t.unit)} … ${formatValueUnit(r.max, t.unit)}`;
    })
    .join('   ');

  return (
    <div className="lane">
      <div className="lane-header">
        <div className="lane-chips">
          {traces.map((t) => (
            <span className="chip" key={t.key}>
              <i className="dot" style={{ background: t.color }} />
              {t.label}
              <em>{t.unit}</em>
            </span>
          ))}
        </div>
        <div className="lane-info mono">{hoverReadout ?? rangeReadout}</div>
      </div>
      <div className="lane-canvas" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (!dragRef.current) onHover(null);
          }}
          onDoubleClick={() => onFit()}
        />
      </div>
    </div>
  );
}
