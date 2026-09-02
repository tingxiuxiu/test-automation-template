/** Signal keys understood by the scope. */
export type SignalKey = 'Uu' | 'Uv' | 'Uw' | 'Iu' | 'Iv' | 'Iw' | 'Nm' | 'Tl';

export type SignalGroup = 'voltage' | 'current' | 'motor';

export interface SignalMeta {
  key: SignalKey;
  label: string;
  group: SignalGroup;
  color: string;
  unit: string;
}

export interface WaveformMeta {
  adc?: { bits?: number; vref?: number; channels?: number };
  memory?: { usedBytes?: number; totalBytes?: number };
  test?: { name?: string; start?: string };
}

export interface WaveformDataset {
  /** Sampling rate in Hz. */
  samplingRate: number;
  /** Per-signal sample arrays; all arrays are expected to share a time base. */
  signals: Partial<Record<SignalKey, number[]>>;
  meta?: WaveformMeta;
}

/** Visible time window in sample indices (end exclusive). */
export interface Viewport {
  start: number;
  end: number;
}

/** A/B cursor positions in sample indices. */
export interface CursorPair {
  a: number;
  b: number;
}

/** Box-selection region in sample indices. */
export interface Brush {
  start: number;
  end: number;
}

/** Measurement window (inclusive bounds, sorted). */
export interface MeasureWindow {
  i0: number;
  i1: number;
}
