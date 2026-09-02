import { useMemo } from 'react';
import { formatBytes, formatDuration, formatFreq } from '../utils/format';
import type { Viewport, WaveformDataset } from '../types';

interface StatusBarProps {
  dataset: WaveformDataset;
  viewport: Viewport;
}

/** Bottom bar: sampling / memory / ADC status. */
export function StatusBar({ dataset, viewport }: StatusBarProps) {
  const info = useMemo(() => {
    const lens = Object.values(dataset.signals).map((a) => (a ? a.length : 0));
    const points = lens.length ? Math.max(...lens) : 0;
    const mem = dataset.meta?.memory;
    const adc = dataset.meta?.adc;
    const viewSpan = viewport.end - viewport.start;
    return {
      points,
      mem:
        mem && mem.totalBytes && mem.usedBytes != null
          ? {
              pct: (mem.usedBytes / mem.totalBytes) * 100,
              used: mem.usedBytes,
              total: mem.totalBytes,
            }
          : null,
      adc: adc ? adc : null,
      viewSpan,
    };
  }, [dataset, viewport]);

  return (
    <footer className="status-bar mono">
      <span title="Sampling rate">
        FS <b>{formatFreq(dataset.samplingRate)}</b>
      </span>
      <span title="Total acquired points">
        POINTS <b>{info.points.toLocaleString()}</b>
      </span>
      <span title="Total capture duration">
        DURATION <b>{formatDuration(info.points / dataset.samplingRate)}</b>
      </span>
      <span title="Current viewport">
        VIEW <b>{formatDuration(info.viewSpan / dataset.samplingRate)}</b> ·{' '}
        {Math.round(info.viewSpan).toLocaleString()} pts
      </span>
      {info.mem && (
        <span title="Acquisition memory">
          MEMORY <b>{info.mem.pct.toFixed(1)} %</b> ({formatBytes(info.mem.used)} /{' '}
          {formatBytes(info.mem.total)})
        </span>
      )}
      {info.adc && (
        <span title="Analog front-end">
          ADC <b>{info.adc.bits ?? '?'}-bit</b>
          {info.adc.vref != null ? ` · ${info.adc.vref} V` : ''}
          {info.adc.channels != null ? ` · ${info.adc.channels} ch` : ''}
        </span>
      )}
    </footer>
  );
}
