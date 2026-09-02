import { GROUP_ORDER, GROUP_TITLES, SIGNALS } from '../config/signals';
import { SignalLane } from './SignalLane';
import type { Trace } from './SignalLane';
import { TimeAxis } from './TimeAxis';
import { MeasurementOverlay } from './MeasurementOverlay';
import { MeasurementTable } from './MeasurementTable';
import type {
  Brush,
  CursorPair,
  MeasureWindow,
  SignalGroup,
  SignalKey,
  Viewport,
  WaveformDataset,
} from '../types';

interface WaveformAreaProps {
  dataset: WaveformDataset;
  visibleKeys: SignalKey[];
  merge: boolean;
  viewport: Viewport;
  cursors: CursorPair;
  brush: Brush | null;
  hoverIdx: number | null;
  measureWindow: MeasureWindow;
  onZoomAt: (factor: number, anchorFrac: number) => void;
  onPan: (deltaSamples: number) => void;
  onCursorMove: (which: 'a' | 'b', idx: number) => void;
  onBrush: (brush: Brush | null) => void;
  onHover: (idx: number | null) => void;
  onFit: () => void;
}

/**
 * Left column: the three synchronized channel groups (Voltage / Current /
 * Speed & Load), the shared time axis, the cursor overlay readout and the
 * measurement table.
 */
export function WaveformArea(props: WaveformAreaProps) {
  const { dataset, visibleKeys, merge, viewport, cursors, brush, hoverIdx, measureWindow } = props;
  const fs = dataset.samplingRate;

  const toTrace = (key: SignalKey): Trace => {
    const meta = SIGNALS[key];
    return {
      key,
      label: meta.label,
      color: meta.color,
      unit: meta.unit,
      data: (dataset.signals[key] ?? []) as number[],
    };
  };

  const renderGroup = (group: SignalGroup) => {
    const keys = visibleKeys.filter(
      (k) => SIGNALS[k].group === group && dataset.signals[k],
    );
    if (keys.length === 0) return null;

    const lanes: { traces: Trace[]; sharedScale: boolean; height: number }[] = merge
      ? [
          {
            traces: keys.map(toTrace),
            // same unit (e.g. the three voltage phases) → shared Y scale,
            // mixed units (rpm vs N·m) → per-trace auto-normalization
            sharedScale: new Set(keys.map((k) => SIGNALS[k].unit)).size === 1,
            height: 220,
          },
        ]
      : keys.map((k) => ({ traces: [toTrace(k)], sharedScale: true, height: 150 }));

    return (
      <section className="signal-group" key={group}>
        <header className="group-header">
          <span className="group-title">{GROUP_TITLES[group]}</span>
          <span className="group-sub mono">{keys.map((k) => SIGNALS[k].label).join(' · ')}</span>
        </header>
        {lanes.map((lane, i) => (
          <SignalLane
            key={lane.traces.map((t) => t.key).join('+') + i}
            traces={lane.traces}
            sharedScale={lane.sharedScale}
            height={lane.height}
            fs={fs}
            viewport={viewport}
            cursors={cursors}
            brush={brush}
            hoverIdx={hoverIdx}
            onZoomAt={props.onZoomAt}
            onPan={props.onPan}
            onCursorMove={props.onCursorMove}
            onBrush={props.onBrush}
            onHover={props.onHover}
            onFit={props.onFit}
          />
        ))}
      </section>
    );
  };

  const hasAnyGroup = GROUP_ORDER.some((g) =>
    visibleKeys.some((k) => SIGNALS[k].group === g && dataset.signals[k]),
  );

  return (
    <main className="waveform-area">
      <div className="area-header">
        <h2>Waveform</h2>
        <div className="toolbar">
          <button type="button" onClick={() => props.onZoomAt(0.7, 0.5)} title="Zoom in">
            Zoom In
          </button>
          <button type="button" onClick={() => props.onZoomAt(1.4, 0.5)} title="Zoom out">
            Zoom Out
          </button>
          <button type="button" onClick={props.onFit} title="Fit to full capture">
            Fit
          </button>
          <button
            type="button"
            onClick={() => props.onBrush(null)}
            disabled={!brush}
            title="Clear box selection"
          >
            Clear Region
          </button>
        </div>
      </div>

      <div className="area-scroll">
        {hasAnyGroup ? (
          GROUP_ORDER.map(renderGroup)
        ) : (
          <div className="empty-hint">Enable a signal on the control panel to display waveforms.</div>
        )}
        <TimeAxis
          viewport={viewport}
          fs={fs}
          cursors={cursors}
          brush={brush}
          onPan={props.onPan}
        />
        <MeasurementOverlay
          fs={fs}
          cursors={cursors}
          brush={brush}
          window={measureWindow}
          hoverIdx={hoverIdx}
        />
        <MeasurementTable dataset={dataset} keys={visibleKeys} window={measureWindow} />
      </div>
    </main>
  );
}
