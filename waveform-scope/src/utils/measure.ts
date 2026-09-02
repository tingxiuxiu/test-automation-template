export interface SignalStats {
  count: number;
  vmin: number;
  vmax: number;
  vpp: number;
  mean: number;
  rms: number;
  /** Mean period in samples (null when fewer than 2 rising mid-crossings). */
  period: number | null;
  freq: number | null;
  /** Mean high-level ratio of one cycle (null when not measurable). */
  duty: number | null;
}

function interpolate(prev: number, cur: number, idx: number, level: number): number {
  const dv = cur - prev;
  if (dv === 0) return idx;
  return idx - 1 + (level - prev) / dv;
}

/**
 * Statistics over data[i0 .. i1] (inclusive bounds, clamped to array).
 *
 * Frequency / period / duty use the mid-level crossing method, which works for
 * sine as well as PWM/square signals:
 *   - period: mean interval between successive rising mid-crossings
 *   - duty:   mean (rising → next falling) high time relative to its cycle
 */
export function computeStats(
  data: readonly number[],
  i0: number,
  i1: number,
  fs: number,
): SignalStats {
  const start = Math.max(0, Math.floor(i0));
  const end = Math.min(data.length, Math.ceil(i1));
  const empty: SignalStats = {
    count: 0,
    vmin: NaN,
    vmax: NaN,
    vpp: NaN,
    mean: NaN,
    rms: NaN,
    period: null,
    freq: null,
    duty: null,
  };
  if (end <= start) return empty;

  let vmin = Infinity;
  let vmax = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = start; i < end; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    sum += v;
    sumSq += v * v;
    n += 1;
  }
  if (n === 0) return empty;

  const mean = sum / n;
  const rms = Math.sqrt(sumSq / n);
  const base: SignalStats = {
    count: n,
    vmin,
    vmax,
    vpp: vmax - vmin,
    mean,
    rms,
    period: null,
    freq: null,
    duty: null,
  };
  if (vmax === vmin || fs <= 0) return base;

  const mid = (vmin + vmax) / 2;
  const rising: number[] = [];
  const falling: number[] = [];
  let prev = data[start];
  for (let i = start + 1; i < end; i++) {
    const v = data[i];
    if (prev < mid && v >= mid) rising.push(interpolate(prev, v, i, mid));
    else if (prev > mid && v <= mid) falling.push(interpolate(prev, v, i, mid));
    prev = v;
  }

  if (rising.length >= 2) {
    let periodSum = 0;
    for (let j = 1; j < rising.length; j++) periodSum += rising[j] - rising[j - 1];
    const period = periodSum / (rising.length - 1);
    base.period = period;
    base.freq = fs / period;

    const duties: number[] = [];
    for (let j = 0; j + 1 < rising.length; j++) {
      const nextFall = falling.find((f) => f >= rising[j]);
      if (nextFall === undefined) continue;
      const cycle = rising[j + 1] - rising[j];
      if (cycle <= 0) continue;
      const high = Math.min(nextFall - rising[j], cycle);
      if (high > 0) duties.push(high / cycle);
    }
    if (duties.length > 0) {
      base.duty = duties.reduce((s, d) => s + d, 0) / duties.length;
    }
  }
  return base;
}
