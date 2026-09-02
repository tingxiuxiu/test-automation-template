import { useCallback, useMemo, useState } from 'react';
import { ALL_SIGNAL_KEYS, MOTOR_SIGNALS, VOLTAGE_CURRENT_PAIRS } from '../config/signals';
import { ControlPanel } from './ControlPanel';
import { WaveformArea } from './WaveformArea';
import { StatusBar } from './StatusBar';
import type {
  Brush,
  CursorPair,
  MeasureWindow,
  SignalKey,
  Viewport,
  WaveformDataset,
} from '../types';

interface WaveformAppProps {
  dataset: WaveformDataset;
}

/**
 * Orchestrator: owns every piece of shared scope state (toggles, merge mode,
 * viewport, A/B cursors, box selection, hover) so all waveform groups stay
 * perfectly synchronized.
 */
export function WaveformApp({ dataset }: WaveformAppProps) {
  const total = useMemo(() => {
    const lens = Object.values(dataset.signals).map((a) => (a ? a.length : 0));
    return Math.max(1, ...lens);
  }, [dataset]);

  const [pairOn, setPairOn] = useState<boolean[]>(() => VOLTAGE_CURRENT_PAIRS.map(() => true));
  const [motorOn, setMotorOn] = useState<Record<'Nm' | 'Tl', boolean>>({ Nm: true, Tl: true });
  const [merge, setMerge] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ start: 0, end: total });
  const [cursors, setCursors] = useState<CursorPair>({
    a: Math.round(total * 0.25),
    b: Math.round(total * 0.75),
  });
  const [brush, setBrush] = useState<Brush | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visibleKeys = useMemo<SignalKey[]>(() => {
    if (merge) return ALL_SIGNAL_KEYS.filter((k) => Boolean(dataset.signals[k]));
    const keys: SignalKey[] = [];
    VOLTAGE_CURRENT_PAIRS.forEach((pair, i) => {
      if (pairOn[i]) {
        keys.push(pair.voltage, pair.current);
      }
    });
    MOTOR_SIGNALS.forEach((k) => {
      if (motorOn[k as 'Nm' | 'Tl']) keys.push(k);
    });
    return keys.filter((k) => Boolean(dataset.signals[k]));
  }, [merge, pairOn, motorOn, dataset]);

  const clamp = useCallback(
    (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
    [],
  );

  const onZoomAt = useCallback(
    (factor: number, anchorFrac: number) => {
      setViewport((vp) => {
        const span = vp.end - vp.start;
        const newSpan = clamp(span * factor, Math.max(2, total * 1e-4), total);
        const anchor = vp.start + anchorFrac * span;
        const start = clamp(anchor - anchorFrac * newSpan, 0, total - newSpan);
        return { start, end: start + newSpan };
      });
    },
    [total, clamp],
  );

  const onPan = useCallback(
    (deltaSamples: number) => {
      setViewport((vp) => {
        const span = vp.end - vp.start;
        const start = clamp(vp.start + deltaSamples, 0, total - span);
        return { start, end: start + span };
      });
    },
    [total, clamp],
  );

  const onCursorMove = useCallback(
    (which: 'a' | 'b', idx: number) => {
      setCursors((c) => ({ ...c, [which]: clamp(Math.round(idx), 0, total - 1) }));
    },
    [total, clamp],
  );

  const onFit = useCallback(() => {
    setViewport({ start: 0, end: total });
    setBrush(null);
  }, [total]);

  // Brush (box selection) takes precedence over the A/B cursor span.
  const measureWindow = useMemo<MeasureWindow>(() => {
    if (brush) {
      return { i0: Math.min(brush.start, brush.end), i1: Math.max(brush.start, brush.end) };
    }
    return { i0: Math.min(cursors.a, cursors.b), i1: Math.max(cursors.a, cursors.b) };
  }, [brush, cursors]);

  return (
    <div className="waveform-app">
      <div className="app-body">
        <WaveformArea
          dataset={dataset}
          visibleKeys={visibleKeys}
          viewport={viewport}
          cursors={cursors}
          brush={brush}
          hoverIdx={hoverIdx}
          measureWindow={measureWindow}
          onZoomAt={onZoomAt}
          onPan={onPan}
          onCursorMove={onCursorMove}
          onBrush={setBrush}
          onHover={setHoverIdx}
          onFit={onFit}
        />
        <ControlPanel
          pairOn={pairOn}
          onPairToggle={(i) => setPairOn((p) => p.map((v, j) => (j === i ? !v : v)))}
          motorOn={motorOn}
          onMotorToggle={(key) => setMotorOn((m) => ({ ...m, [key]: !m[key] }))}
          merge={merge}
          onMergeToggle={() => setMerge((v) => !v)}
        />
      </div>
      <StatusBar dataset={dataset} viewport={viewport} />
    </div>
  );
}
