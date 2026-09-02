import { useMemo } from 'react';
import { SIGNALS } from '../config/signals';
import { computeStats } from '../utils/measure';
import {
  formatDuration,
  formatFreq,
  formatPercent,
  formatValueUnit,
} from '../utils/format';
import type { MeasureWindow, SignalKey, WaveformDataset } from '../types';

interface MeasurementTableProps {
  dataset: WaveformDataset;
  keys: SignalKey[];
  window: MeasureWindow;
}

/**
 * Per-signal statistics (Vpp / mean / RMS / min / max / frequency / period /
 * duty) computed over the active measurement window.
 */
export function MeasurementTable({ dataset, keys, window }: MeasurementTableProps) {
  const rows = useMemo(
    () =>
      keys
        .filter((k) => dataset.signals[k])
        .map((k) => ({
          meta: SIGNALS[k],
          stats: computeStats(dataset.signals[k] as number[], window.i0, window.i1, dataset.samplingRate),
        })),
    [dataset, keys, window],
  );

  if (rows.length === 0) {
    return <div className="empty-hint">Enable a signal on the control panel to see measurements.</div>;
  }

  const u = (v: number, unit: string) => formatValueUnit(v, unit);

  return (
    <div className="measure-table-wrap">
      <table className="measure-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Vpp</th>
            <th>Mean</th>
            <th>RMS</th>
            <th>Min</th>
            <th>Max</th>
            <th>Freq</th>
            <th>Period</th>
            <th>Duty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ meta, stats }) => (
            <tr key={meta.key}>
              <td>
                <span className="signal-cell">
                  <i className="dot" style={{ background: meta.color }} />
                  {meta.label}
                  <em>{meta.unit}</em>
                </span>
              </td>
              <td className="mono">{u(stats.vpp, meta.unit)}</td>
              <td className="mono">{u(stats.mean, meta.unit)}</td>
              <td className="mono">{u(stats.rms, meta.unit)}</td>
              <td className="mono">{u(stats.vmin, meta.unit)}</td>
              <td className="mono">{u(stats.vmax, meta.unit)}</td>
              <td className="mono">{formatFreq(stats.freq ?? Number.NaN)}</td>
              <td className="mono">
                {stats.period != null ? formatDuration(stats.period / dataset.samplingRate) : '—'}
              </td>
              <td className="mono">{stats.duty != null ? formatPercent(stats.duty) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
