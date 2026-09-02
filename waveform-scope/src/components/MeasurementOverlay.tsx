import type { Brush, CursorPair, MeasureWindow } from '../types';
import { formatDuration, formatFreq } from '../utils/format';

interface MeasurementOverlayProps {
  fs: number;
  cursors: CursorPair;
  brush: Brush | null;
  window: MeasureWindow;
  hoverIdx: number | null;
}

/**
 * Floating readout above the measurement table: A/B cursor times, the active
 * window (box selection or cursor span) with Δt and 1/Δt, plus hover time.
 */
export function MeasurementOverlay({ fs, cursors, brush, window, hoverIdx }: MeasurementOverlayProps) {
  const t = (idx: number) => formatDuration(idx / fs);
  const dt = (window.i1 - window.i0) / fs;
  const source = brush ? 'Box selection' : 'A/B cursors';
  return (
    <div className="measure-overlay mono">
      <span className={`chip source-chip ${brush ? 'region' : 'cursors'}`}>{source}</span>
      <span>
        A <b>{t(cursors.a)}</b>
      </span>
      <span>
        B <b>{t(cursors.b)}</b>
      </span>
      <span>
        Δt <b>{formatDuration(dt)}</b>
      </span>
      <span>
        1/Δt <b>{formatFreq(dt > 0 ? 1 / dt : Number.NaN)}</b>
      </span>
      {hoverIdx != null && (
        <span className="hover-readout">
          hover <b>{t(hoverIdx)}</b>
        </span>
      )}
    </div>
  );
}
