const PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
];

/** Engineering notation with SI prefix, e.g. 311.1 -> "311 V", 0.004 -> "4.00 m". */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  for (const [factor, prefix] of PREFIXES) {
    if (a >= factor) {
      const scaled = v / factor;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      return `${scaled.toFixed(digits)} ${prefix}`;
    }
  }
  return v.toExponential(2);
}

/** Value with a physical unit, e.g. formatValueUnit(622.2, 'V') -> "622 V". */
export function formatValueUnit(v: number, unit: string): string {
  return `${formatValue(v).trim()}${unit ? ` ${unit}` : ''}`.replace('  ', ' ');
}

/** Frequency with SI prefix, e.g. 50 -> "50.0 Hz". */
export function formatFreq(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  return `${formatValue(hz).trim()}Hz`;
}

/** Adaptive duration formatting: s / ms / µs / ns. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const a = Math.abs(seconds);
  if (a === 0) return '0 s';
  if (a >= 1) return `${seconds.toFixed(3)} s`;
  if (a >= 1e-3) return `${(seconds * 1e3).toFixed(2)} ms`;
  if (a >= 1e-6) return `${(seconds * 1e6).toFixed(2)} µs`;
  return `${(seconds * 1e9).toFixed(2)} ns`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)} %`;
}
