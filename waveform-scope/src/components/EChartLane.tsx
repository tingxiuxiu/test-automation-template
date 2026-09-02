import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Brush, CursorPair, Viewport } from '../types';
import { useElementWidth } from '../hooks/useElementWidth';
import { formatDuration, formatValue, formatValueUnit } from '../utils/format';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

export interface Trace {
  key: string;
  label: string;
  color: string;
  unit: string;
  data: number[];
  /** Index into the lane's yAxisDefs (default 0). */
  yAxisIndex?: number;
}

export interface YAxisDef {
  unit: string;
  position: 'left' | 'right';
}

interface EChartLaneProps {
  traces: Trace[];
  yAxisDefs: YAxisDef[];
  viewport: Viewport;
  cursors: CursorPair;
  brush: Brush | null;
  fs: number;
  height?: number;
  onZoomAt: (factor: number, anchorFrac: number) => void;
  onPan: (deltaSamples: number) => void;
  onCursorMove: (which: 'a' | 'b', idx: number) => void;
  onBrush: (brush: Brush | null) => void;
  onFit: () => void;
}

/** Grid margins (CSS px) — TimeAxis uses the same values to stay aligned. */
export const LANE_GRID = { left: 64, right: 64, top: 30, bottom: 26 };

const CURSOR_COLORS = { a: '#fb923c', b: '#22d3ee' } as const;
const CURSOR_HIT_PX = 8;
const CONNECT_GROUP = 'wf-scope';

interface DragState {
  mode: 'pan' | 'cursorA' | 'cursorB' | 'brush';
  lastX: number;
  start?: number;
  moved?: boolean;
}

/**
 * One ECharts-powered oscilloscope lane: line series with LTTB sampling,
 * native axis/tooltip, markLine A/B cursors and markArea measurement window.
 *
 * Zoom / pan / cursor dragging / box selection are implemented on zrender
 * events and delegated to the parent, which owns all shared scope state —
 * this keeps the three lanes perfectly synchronized (same architecture as
 * the previous custom-canvas version).
 */
export function EChartLane(props: EChartLaneProps) {
  const { traces, yAxisDefs, viewport, cursors, brush, fs, height = 230 } = props;
  const { onZoomAt, onPan, onCursorMove, onBrush, onFit } = props;

  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const chartRef = useRef<echarts.ECharts | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const dataLen = useMemo(() => traces.reduce((m, t) => Math.max(m, t.data.length), 1), [traces]);

  // latest props for the imperative zrender handlers (avoids stale closures)
  const latestRef = useRef({ ...props, dataLen });
  latestRef.current = { ...props, dataLen };

  // per-axis visible min/max with 10% headroom so troughs never clip
  const ranges = useMemo(
    () =>
      yAxisDefs.map((def, ai) => {
        const i0 = Math.max(0, Math.floor(viewport.start));
        let min = Infinity;
        let max = -Infinity;
        for (const t of traces) {
          if ((t.yAxisIndex ?? 0) !== ai) continue;
          const i1 = Math.min(t.data.length, Math.ceil(viewport.end));
          for (let i = i0; i < i1; i++) {
            const v = t.data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          min = 0;
          max = 1;
        } else if (min === max) {
          const b = Math.abs(min) || 1;
          min -= b * 0.1;
          max += b * 0.1;
        }
        const pad = (max - min) * 0.1;
        return { min: min - pad, max: max + pad, rawMin: min, rawMax: max, unit: def.unit };
      }),
    [traces, viewport, yAxisDefs],
  );

  // series data as [index, value] pairs; recomputed only when traces change
  const seriesData = useMemo(
    () =>
      traces.map((t) => {
        const arr: Array<[number, number]> = new Array(t.data.length);
        for (let i = 0; i < t.data.length; i++) arr[i] = [i, t.data[i]];
        return arr;
      }),
    [traces],
  );

  const measureStart = brush
    ? Math.min(brush.start, brush.end)
    : Math.min(cursors.a, cursors.b);
  const measureEnd = brush ? Math.max(brush.start, brush.end) : Math.max(cursors.a, cursors.b);

  const option = useMemo(() => {
    const byKey = new Map(traces.map((t) => [t.key, t]));
    const series: LineSeriesOption[] = traces.map((t, i) => ({
      id: t.key,
      name: t.label,
      type: 'line',
      yAxisIndex: t.yAxisIndex ?? 0,
      showSymbol: false,
      sampling: 'lttb',
      lineStyle: { color: t.color, width: 1.25 },
      itemStyle: { color: t.color },
      emphasis: { disabled: true },
      data: seriesData[i],
    }));
    // overlay series carries the A/B cursor lines and measurement-window tint
    series.push({
      id: '__overlay',
      name: '__overlay',
      type: 'line',
      silent: true,
      data: [],
      markLine: {
        silent: true,
        symbol: ['none', 'none'],
        animation: false,
        data: [
          {
            xAxis: cursors.a,
            lineStyle: { color: CURSOR_COLORS.a, type: 'dashed', width: 1 },
            label: {
              // default position renders a horizontal label at the line's top
              formatter: `A ${formatDuration(cursors.a / fs)}`,
              color: CURSOR_COLORS.a,
              fontSize: 10,
            },
          },
          {
            xAxis: cursors.b,
            lineStyle: { color: CURSOR_COLORS.b, type: 'dashed', width: 1 },
            label: {
              formatter: `B ${formatDuration(cursors.b / fs)}`,
              color: CURSOR_COLORS.b,
              fontSize: 10,
            },
          },
        ],
      },
      markArea: {
        silent: true,
        itemStyle: { color: brush ? 'rgba(56,189,248,0.10)' : 'rgba(148,163,184,0.05)' },
        data: [[{ xAxis: measureStart }, { xAxis: measureEnd }]],
      },
    });

    return {
      animation: false,
      backgroundColor: '#0a1017',
      grid: { ...LANE_GRID },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(226,232,240,0.35)', width: 1 } },
        backgroundColor: '#10161f',
        borderColor: '#1e2a3a',
        padding: [6, 10],
        textStyle: { color: '#d7e1ec', fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = params as Array<{
            seriesId: string;
            seriesName: string;
            value: [number, number];
            marker: string;
          }>;
          if (!Array.isArray(arr) || arr.length === 0) return '';
          const idx = arr[0].value[0];
          const lines = [`<span style="color:#7d8fa5">${formatDuration(idx / fs)}</span>`];
          for (const p of arr) {
            const t = byKey.get(p.seriesId);
            if (!t) continue;
            lines.push(`${p.marker} ${p.seriesName}&nbsp;&nbsp;<b>${formatValueUnit(p.value[1], t.unit)}</b>`);
          }
          return lines.join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        min: viewport.start,
        max: viewport.end,
        axisLine: { lineStyle: { color: '#1e2a3a' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#7d8fa5',
          fontSize: 10,
          fontFamily: 'ui-monospace, Menlo, monospace',
          hideOverlap: true,
          formatter: (v: number) => formatDuration(v / fs),
        },
        splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.08)' } },
      },
      yAxis: yAxisDefs.map((def, i) => ({
        type: 'value' as const,
        min: ranges[i].min,
        max: ranges[i].max,
        position: def.position,
        name: def.unit,
        nameTextStyle: { color: '#7d8fa5', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: {
          color: '#7d8fa5',
          fontSize: 10,
          fontFamily: 'ui-monospace, Menlo, monospace',
          formatter: (v: number) => formatValue(v),
        },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.10)' } },
      })),
      series,
    };
  }, [traces, yAxisDefs, ranges, seriesData, viewport, cursors, brush, fs, measureStart, measureEnd]);

  // structure changes (added/removed series or axes) need a non-merge setOption
  const structureKey = useMemo(
    () => `${yAxisDefs.map((d) => d.unit).join('|')}/${traces.map((t) => t.key).join(',')}`,
    [yAxisDefs, traces],
  );
  const prevStructureRef = useRef('');

  // ---- chart lifecycle (init once; zrender interactions) -------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.group = CONNECT_GROUP;
    echarts.connect(CONNECT_GROUP); // hover crosshair/tooltip synced across lanes
    chartRef.current = chart;

    const zr = chart.getZr();

    const clampIdx = (v: number) => {
      const len = latestRef.current.dataLen;
      return Math.min(Math.max(0, Math.round(v)), Math.max(0, len - 1));
    };
    const axisVal = (x: number) => {
      const v = chart.convertFromPixel({ xAxisIndex: 0 }, x);
      return Number.isFinite(v) ? v : 0;
    };
    const axisPix = (v: number) => {
      const p = chart.convertToPixel({ xAxisIndex: 0 }, v);
      return Number.isFinite(p) ? p : -9999;
    };

    zr.on('mousedown', (e: { offsetX: number; shiftKey?: boolean }) => {
      const x = e.offsetX;
      if (e.shiftKey) {
        dragRef.current = { mode: 'pan', lastX: x };
        return;
      }
      const { cursors: c } = latestRef.current;
      if (Math.abs(x - axisPix(c.a)) <= CURSOR_HIT_PX) {
        dragRef.current = { mode: 'cursorA', lastX: x };
        return;
      }
      if (Math.abs(x - axisPix(c.b)) <= CURSOR_HIT_PX) {
        dragRef.current = { mode: 'cursorB', lastX: x };
        return;
      }
      const v = clampIdx(axisVal(x));
      dragRef.current = { mode: 'brush', lastX: x, start: v, moved: false };
      latestRef.current.onBrush({ start: v, end: v });
    });

    zr.on('mousemove', (e: { offsetX: number }) => {
      const x = e.offsetX;
      const d = dragRef.current;
      const { cursors: c, viewport: vp } = latestRef.current;
      if (!d) {
        const near =
          Math.abs(x - axisPix(c.a)) <= CURSOR_HIT_PX || Math.abs(x - axisPix(c.b)) <= CURSOR_HIT_PX;
        zr.setCursorStyle(near ? 'ew-resize' : 'crosshair');
        return;
      }
      const span = Math.max(1, vp.end - vp.start);
      const plotW = Math.max(1, axisPix(vp.end) - axisPix(vp.start));
      if (d.mode === 'pan') {
        const dx = x - d.lastX;
        d.lastX = x;
        latestRef.current.onPan(-(dx / plotW) * span);
      } else if (d.mode === 'cursorA') {
        latestRef.current.onCursorMove('a', clampIdx(axisVal(x)));
      } else if (d.mode === 'cursorB') {
        latestRef.current.onCursorMove('b', clampIdx(axisVal(x)));
      } else {
        if (Math.abs(x - d.lastX) > 2) d.moved = true;
        const v = clampIdx(axisVal(x));
        const s = d.start ?? v;
        latestRef.current.onBrush({ start: Math.min(s, v), end: Math.max(s, v) });
      }
    });

    zr.on('mouseup', () => {
      const d = dragRef.current;
      dragRef.current = null;
      // click without drag → clear the box selection
      if (d?.mode === 'brush' && !d.moved) latestRef.current.onBrush(null);
    });

    zr.on('dblclick', () => latestRef.current.onFit());

    zr.on('mousewheel', (e: { offsetX: number; deltaY?: number; event?: WheelEvent }) => {
      const raw = e.event ?? (e as unknown as WheelEvent);
      raw.preventDefault?.();
      const { viewport: vp } = latestRef.current;
      const p0 = axisPix(vp.start);
      const p1 = axisPix(vp.end);
      const frac = Math.min(Math.max((e.offsetX - p0) / Math.max(1, p1 - p0), 0), 1);
      const delta = e.deltaY ?? raw.deltaY ?? 0;
      latestRef.current.onZoomAt(delta > 0 ? 1.25 : 0.8, frac);
    });

    return () => {
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // push option updates (merge keeps per-series updates cheap; full rebuild
  // only when the series/axis structure changed)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const notMerge = prevStructureRef.current !== structureKey;
    prevStructureRef.current = structureKey;
    chart.setOption(option, { notMerge });
  }, [option, structureKey]);

  // resize with the container
  useEffect(() => {
    chartRef.current?.resize();
  }, [width, height]);

  const rangeReadout = ranges
    .map((r) => `${formatValueUnit(r.rawMin, r.unit)} … ${formatValueUnit(r.rawMax, r.unit)}`)
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
        <div className="lane-info mono">{rangeReadout}</div>
      </div>
      <div className="lane-canvas" ref={containerRef} style={{ height, minHeight: 10 }} />
    </div>
  );
}
