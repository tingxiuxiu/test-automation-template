import { GROUP_ORDER, GROUP_TITLES, SIGNALS } from '../config/signals';
import { EChartLane, type Trace, type YAxisDef } from './EChartLane';
import { LANE_GRID } from './EChartLane';
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
  viewport: Viewport;
  cursors: CursorPair;
  brush: Brush | null;
  measureWindow: MeasureWindow;
  onZoomAt: (factor: number, anchorFrac: number) => void;
  onPan: (deltaSamples: number) => void;
  onCursorMove: (which: 'a' | 'b', idx: number) => void;
  onBrush: (brush: Brush | null) => void;
  onFit: () => void;
}

/**
 * Left column: the three synchronized channel groups (Voltage / Current /
 * Speed & Load) rendered with ECharts, the shared time axis, the cursor
 * overlay readout and the measurement table.
 */
export function WaveformArea(props: WaveformAreaProps) {
  const { dataset, visibleKeys, viewport, cursors, brush, measureWindow } = props;
  const fs = dataset.samplingRate;

  const renderGroup = (group: SignalGroup) => {
    const keys = visibleKeys.filter((k) => SIGNALS[k].group === group && dataset.signals[k]);
    if (keys.length === 0) return null;

    // one y-axis per distinct unit: first unit left, extra units right
    // (e.g. the motor lane gets rpm on the left and N·m on the right)
    const units = [...new Set(keys.map((k) => SIGNALS[k].unit))];
    const yAxisDefs: YAxisDef[] = units.map((unit, i) => ({
      unit,
      position: i === 0 ? 'left' : 'right',
    }));
    const traces: Trace[] = keys.map((k) => {
      const meta = SIGNALS[k];
      return {
        key: k,
        label: meta.label,
        color: meta.color,
        unit: meta.unit,
        data: (dataset.signals[k] ?? []) as number[],
        yAxisIndex: units.indexOf(meta.unit),
      };
    });

    return (
      <section className="signal-group" key={group}>
        <header className="group-header">
          <span className="group-title">{GROUP_TITLES[group]}</span>
          <span className="group-sub mono">{keys.map((k) => SIGNALS[k].label).join(' · ')}</span>
        </header>
        <EChartLane
          traces={traces}
          yAxisDefs={yAxisDefs}
          height={230}
          fs={fs}
          viewport={viewport}
          cursors={cursors}
          brush={brush}
          onZoomAt={props.onZoomAt}
          onPan={props.onPan}
          onCursorMove={props.onCursorMove}
          onBrush={props.onBrush}
          onFit={props.onFit}
        />
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
          padLeft={LANE_GRID.left}
          padRight={LANE_GRID.right}
        />
        <MeasurementOverlay fs={fs} cursors={cursors} brush={brush} window={measureWindow} />
        <MeasurementTable dataset={dataset} keys={visibleKeys} window={measureWindow} />
      </div>
    </main>
  );
}
