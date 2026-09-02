import { useEffect, useRef } from 'react';
import type { Brush, CursorPair, Viewport } from '../types';
import { useElementWidth } from '../hooks/useElementWidth';
import { niceTimeTicks } from '../utils/axis';

interface TimeAxisProps {
  viewport: Viewport;
  fs: number;
  cursors: CursorPair;
  brush: Brush | null;
  onPan: (deltaSamples: number) => void;
}

const PAD = { left: 10, right: 10 };
const HEIGHT = 30;

/** Shared time axis under all lanes; dragging it pans every synchronized lane. */
export function TimeAxis({ viewport, fs, cursors, brush, onPan }: TimeAxisProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ lastX: number } | null>(null);
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();

  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const span = Math.max(1, viewport.end - viewport.start);
  const xOf = (i: number) => PAD.left + ((i - viewport.start) / span) * plotW;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, 0, width, HEIGHT);

    // brush extent bar
    if (brush) {
      const x0 = xOf(Math.min(brush.start, brush.end));
      const x1 = xOf(Math.max(brush.start, brush.end));
      ctx.fillStyle = 'rgba(56,189,248,0.55)';
      ctx.fillRect(Math.min(x0, x1), 1, Math.abs(x1 - x0), 3);
    }

    // ticks + labels
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = fs > 0 ? niceTimeTicks(viewport.start / fs, viewport.end / fs, plotW) : [];
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.fillStyle = '#7d8fa5';
    ctx.beginPath();
    for (const tk of ticks) {
      const x = PAD.left + ((tk.t * fs - viewport.start) / span) * plotW;
      if (x < PAD.left - 1 || x > PAD.left + plotW + 1) continue;
      ctx.moveTo(x, HEIGHT - 6);
      ctx.lineTo(x, HEIGHT - 1);
      ctx.fillText(tk.label, x, 2);
    }
    ctx.stroke();

    // cursor position markers
    const marker = (idx: number, color: string, label: string) => {
      const x = xOf(idx);
      if (x < PAD.left || x > PAD.left + plotW) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT - 12);
      ctx.lineTo(x - 4, HEIGHT - 19);
      ctx.lineTo(x + 4, HEIGHT - 19);
      ctx.closePath();
      ctx.fill();
      ctx.fillText(label, x, HEIGHT - 17);
    };
    marker(cursors.a, '#fb923c', '');
    marker(cursors.b, '#22d3ee', '');
  });

  const localX = (e: { clientX: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return e.clientX - (rect?.left ?? 0);
  };

  return (
    <div className="time-axis" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: HEIGHT, display: 'block', cursor: 'grab' }}
        title="Drag to pan · labels in seconds"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { lastX: localX(e) };
          e.currentTarget.style.cursor = 'grabbing';
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          const x = localX(e);
          onPan(-((x - drag.lastX) / plotW) * span);
          drag.lastX = x;
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          e.currentTarget.style.cursor = 'grab';
        }}
      />
    </div>
  );
}
